import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import https from "node:https";
import http from "node:http";
import * as cheerio from "cheerio";
import { AppError } from "./server";
import { youtubeTranscript } from "./youtube";
const blocked = new BlockList();
for (const [ip, mask] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, mask, "ipv4");
export function isPublicAddress(ip: string) {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    const allowed = new BlockList();
    allowed.addSubnet("2000::", 3, "ipv6");
    const denied = new BlockList();
    denied.addSubnet("2001::", 23, "ipv6");
    denied.addSubnet("2001:db8::", 32, "ipv6");
    denied.addSubnet("2002::", 16, "ipv6");
    return allowed.check(ip, "ipv6") && !denied.check(ip, "ipv6");
  }
  return false;
}
export function validateUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AppError("올바른 웹 주소를 입력해 주세요.");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    u.hostname === "localhost" ||
    u.hostname.endsWith(".local") ||
    u.hostname.endsWith(".internal")
  )
    throw new AppError("공개된 웹페이지 주소만 추가할 수 있습니다.");
  const ip = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(ip) && !isPublicAddress(ip))
    throw new AppError("내부 네트워크 주소는 가져올 수 없습니다.");
  u.hash = "";
  return u;
}
export function sourceType(url: string) {
  if (!url) return "text" as const;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  )
    return "youtube" as const;
  if (host === "instagram.com" || host.endsWith(".instagram.com"))
    return "instagram" as const;
  if (
    ["threads.net", "threads.com"].some(
      (h) => host === h || host.endsWith("." + h),
    )
  )
    return "threads" as const;
  return "web" as const;
}
export async function safeFetch(
  raw: string,
  redirects = 0,
  allowFeed = false,
): Promise<{ text: string; url: string; type: string }> {
  const url = validateUrl(raw);
  if (redirects > 3)
    throw new AppError(
      "리디렉션이 너무 많습니다. 본문을 직접 붙여넣어 주세요.",
    );
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new AppError("이 주소는 안전하게 불러올 수 없습니다.");
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).get(
      url,
      {
        family: pinned.family,
        headers: {
          "User-Agent": "AIAtlas/1.0 (personal learning archive)",
          Accept: allowFeed
            ? "application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain"
            : "text/html,text/plain,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, _options, cb) => {
          cb(null, pinned.address, pinned.family);
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          clearTimeout(timer);
          safeFetch(
            new URL(res.headers.location, url).href,
            redirects + 1,
            allowFeed,
          ).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          clearTimeout(timer);
          reject(
            new AppError(
              "원문 사이트가 자동 수집을 허용하지 않습니다. 본문이나 자막을 붙여넣어 주세요.",
              422,
            ),
          );
          return;
        }
        const type = String(res.headers["content-type"] || "");
        if (
          !(allowFeed
            ? /xml|text\/plain/.test(type)
            : /text\/html|text\/plain|application\/xhtml\+xml/.test(type)) ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity")
        ) {
          res.resume();
          clearTimeout(timer);
          reject(
            new AppError(
              "이 형식은 자동 수집할 수 없습니다. 텍스트를 직접 입력해 주세요.",
              422,
            ),
          );
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2_000_000) {
            request.destroy(
              new AppError(
                "페이지가 너무 큽니다. 필요한 본문만 붙여넣어 주세요.",
                422,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            text: Buffer.concat(chunks).toString("utf8"),
            url: url.href,
            type,
          });
        });
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () =>
        request.destroy(
          new AppError(
            "원문 사이트 응답이 늦습니다. 본문을 직접 붙여넣어 주세요.",
            422,
          ),
        ),
      12000,
    );
    request.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
export async function extract(url: string) {
  const type = sourceType(url);
  if (type === "youtube") return youtubeTranscript(url);
  if (type === "instagram" || type === "threads")
    throw new AppError(
      "이 소셜 링크는 게시물 본문이 필요합니다. 원문·출처 탭에서 내용을 붙여넣고 다시 분석해 주세요.",
      422,
    );
  const page = await safeFetch(url);
  if (page.type.includes("text/plain"))
    return {
      text: page.text.slice(0, 60000),
      title: "웹 텍스트",
      method: "web",
    };
  const $ = cheerio.load(page.text);
  // Readability extracts article text only; no scripts or linked resources run.
  try {
    const [{ Readability }, { parseHTML }] = await Promise.all([
      import("@mozilla/readability"),
      import("linkedom"),
    ]);
    const { document } = parseHTML(page.text);
    const article = new Readability(document as unknown as Document).parse();
    if (article?.textContent && article.textContent.trim().length >= 200)
      return {
        text: article.textContent.trim().slice(0, 60000),
        title: (article.title || "웹 아티클").slice(0, 120),
        method: "readability",
      };
  } catch {
    /* Some publishers require the conservative HTML fallback below. */
  }
  const title =
    $('meta[property="og:title"]').attr("content") || $("title").text();
  $("script,style,noscript,nav,header,footer,aside,form,iframe,svg").remove();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  root.find("p,h1,h2,h3,h4,li,br").after("\n");
  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()
    .slice(0, 60000);
  if (text.length < 200)
    throw new AppError(
      "충분한 본문을 읽지 못했습니다. 원문·출처 탭에 본문을 추가해 주세요.",
      422,
    );
  return { text, title: title.trim().slice(0, 120), method: "web" };
}
