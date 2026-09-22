import { admin, checkDb } from "../lib/server";
import { CARD_BUCKET } from "../lib/card-service";
async function main() {
  const db = admin();
  const existing = await db.storage.getBucket(CARD_BUCKET);
  if (existing.data) {
    if (existing.data.public) throw new Error("Card storage must be private.");
    console.log("Private card storage is ready.");
  } else {
    if (
      existing.error &&
      !String(existing.error.message).toLowerCase().includes("not found")
    )
      throw new Error("Card storage status could not be read.");
    const created = await db.storage.createBucket(CARD_BUCKET, {
      public: false,
      allowedMimeTypes: ["image/png"],
      fileSizeLimit: 5 * 1024 * 1024,
    });
    checkDb(created.error);
    console.log(
      "Private card storage created; images are served only by authenticated Atlas routes.",
    );
  }
}
main().catch(() => {
  console.error("Card storage setup failed. Check the private configuration.");
  process.exitCode = 1;
});
