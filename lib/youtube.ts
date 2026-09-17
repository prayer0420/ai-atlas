import { fetchTranscript } from "youtube-transcript";
import { AppError } from "./server";
export function youtubeId(raw: string) {
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const candidate =
    host === "youtu.be"
      ? u.pathname.split("/")[1]
      : u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
}
export async function youtubeTranscript(url: string) {
  const id = youtubeId(url);
  if (!id)
    throw new AppError(
      "영상 링크를 확인해 주세요. 채널이나 재생목록 대신 개별 영상 링크를 넣어주세요.",
      422,
    );
  const signal = AbortSignal.timeout(25000);
  const restrictedFetch: typeof fetch = async (input, init) => {
    const target = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (
      target.protocol !== "https:" ||
      target.hostname !== "www.youtube.com" ||
      target.port ||
      target.username ||
      target.password
    )
      throw new Error("Unsupported transcript host");
    const response = await fetch(target, {
      ...init,
      redirect: "error",
      signal,
    });
    if (!response.ok) return response;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 3_000_000) {
        await reader.cancel();
        throw new Error("Transcript response too large");
      }
      chunks.push(part.value);
    }
    return new Response(Buffer.concat(chunks), {
      status: response.status,
      headers: response.headers,
    });
  };
  try {
    const parts = await fetchTranscript(id, { fetch: restrictedFetch });
    const text = parts
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text.length < 100) throw new Error("Insufficient captions");
    return {
      text: text.slice(0, 60000),
      title: "YouTube 영상 학습 노트",
      method: "youtube_transcript",
    };
  } catch {
    throw new AppError(
      "영상 자막을 자동으로 가져오지 못했습니다. 공개 자막이 없거나 접근이 제한된 영상일 수 있어요. 원문·출처 탭에 자막을 붙여넣으면 분석할 수 있습니다.",
      422,
    );
  }
}
