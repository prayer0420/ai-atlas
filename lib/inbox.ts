import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin, checkDb } from "./server";
import { sourceType, validateUrl } from "./extract";
import { enqueue } from "./automation";
import { readableText } from "./content-text";
export const captureSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().max(120),
        url: z.string().max(2048),
        text: z.string().max(60000).default(""),
        observed_at: z.string().max(60).optional(),
        metrics: z
          .object({
            views: z.number().int().nonnegative().optional(),
            likes: z.number().int().nonnegative().optional(),
            comments: z.number().int().nonnegative().optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(20),
});
export async function importInbox(
  userId: string,
  directory: string,
  manualAnalysis = false,
) {
  const root = path.resolve(directory);
  await fs.mkdir(root, { recursive: true });
  const db = admin();
  let imported = 0,
    errors = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries
    .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name.endsWith(".json"))
    .slice(0, 5)) {
    const file = path.join(root, entry.name);
    try {
      if ((await fs.stat(file)).size > 1_000_000)
        throw new Error("File too large");
      const bundle = captureSchema.parse(
        JSON.parse(await fs.readFile(file, "utf8")),
      );
      // Validate the complete bundle before importing any item.
      const items = bundle.items.map((item) => {
        const url = validateUrl(item.url);
        url.hash = "";
        for (const key of [...url.searchParams.keys()])
          if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
        return { ...item, url: url.href };
      });
      for (const item of items) {
        const fingerprint = createHash("sha256").update(item.url).digest("hex");
        let existing = await db
          .from("ai_atlas_resources")
          .select("id,status")
          .eq("user_id", userId)
          .eq("fingerprint", fingerprint)
          .is("deleted_at", null)
          .maybeSingle();
        checkDb(existing.error);
        if (!existing.data) {
          const notes =
            "자동 수집함에서 가져온 자료" +
            (item.observed_at ? " · 관측: " + item.observed_at : "") +
            (item.metrics
              ? "\n수집 도구가 보고한 반응 수(독립 검증 전): " +
                JSON.stringify(item.metrics)
              : "");
          const saved = await db
            .from("ai_atlas_resources")
            .insert({
              user_id: userId,
              title: readableText(item.title).split("\n")[0].slice(0, 120),
              source_url: item.url,
              source_type: sourceType(item.url),
              raw_text: item.text,
              source_method: item.text ? "capture_inbox" : null,
              fingerprint,
              notes,
            })
            .select("id,status")
            .single();
          if (saved.error?.code === "23505")
            existing = await db
              .from("ai_atlas_resources")
              .select("id,status")
              .eq("user_id", userId)
              .eq("fingerprint", fingerprint)
              .is("deleted_at", null)
              .single();
          else {
            checkDb(saved.error);
            existing = saved;
            imported++;
          }
        }
        if (existing.data && existing.data.status !== "ready")
          await enqueue(
            userId,
            "analyze",
            { resourceId: existing.data.id, manual: manualAnalysis },
            existing.data.id,
          );
      }
      const processed = path.join(root, "processed");
      await fs.mkdir(processed, { recursive: true });
      await fs.rename(
        file,
        path.join(processed, Date.now() + "-" + entry.name),
      );
    } catch {
      errors++;
      await fs.writeFile(
        file + ".error.txt",
        "이 파일을 가져오지 못했습니다. JSON 형식, 공개 URL, 한 파일 20개/1MB 제한 또는 연결 상태를 확인하세요. 이미 저장된 자료는 중복 생성하지 않습니다.\n",
      );
    }
  }
  return { imported, errors };
}
