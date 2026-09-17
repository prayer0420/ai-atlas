import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function read(file: string) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function syncLocalVault(
  root: string,
  files: Record<string, string>,
) {
  root = path.resolve(root);
  await fs.mkdir(root, { recursive: true });
  const manifestPath = path.join(root, ".ai-atlas-manifest.json");
  const raw = await read(manifestPath);
  let previous: Record<string, string> = {};
  if (raw) {
    try {
      previous = JSON.parse(raw);
    } catch {
      throw new Error(
        "보관함 동기화 기록이 손상되었습니다. 기존 파일은 보존했습니다.",
      );
    }
  }
  const next = { ...previous };
  let written = 0,
    conflicts = 0;
  for (const [name, content] of Object.entries(files)) {
    const parts = name.split("/");
    if (
      parts.some(
        (p) => !p || p === "." || p === ".." || /[\\:\x00-\x1f]/.test(p),
      )
    )
      throw new Error("Invalid vault path");
    const target = path.resolve(root, ...parts);
    if (!target.startsWith(root + path.sep))
      throw new Error("Invalid vault path");
    // Refuse junctions/symlinks so a local folder cannot redirect generated writes.
    for (let i = 1; i <= parts.length; i++) {
      try {
        if (
          (
            await fs.lstat(path.join(root, ...parts.slice(0, i)))
          ).isSymbolicLink()
        )
          throw new Error("보관함의 연결 파일에는 쓰지 않습니다.");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    const current = await read(target),
      desired = hash(content);
    if (
      current !== null &&
      (name.startsWith("personal/") || name.startsWith(".obsidian/"))
    )
      continue;
    if (current !== null) {
      const actual = hash(current);
      if (actual === desired) {
        next[name] = desired;
        continue;
      }
      if (
        name.startsWith("raw/") ||
        !previous[name] ||
        previous[name] !== actual
      ) {
        conflicts++;
        continue;
      }
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = target + ".atlas-" + randomUUID() + ".tmp";
    await fs.writeFile(temp, content, { encoding: "utf8", flag: "wx" });
    // Check again immediately before replacement; never overwrite detected user edits.
    if ((await read(target)) !== current) {
      await fs.unlink(temp);
      conflicts++;
      continue;
    }
    await fs.rename(temp, target);
    next[name] = desired;
    written++;
  }
  const temp = manifestPath + ".tmp";
  await fs.writeFile(temp, JSON.stringify(next, null, 2));
  await fs.rename(temp, manifestPath);
  return { written, conflicts };
}
