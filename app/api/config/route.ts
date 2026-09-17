import { NextResponse } from "next/server";
import { admin, credentials, dailyLimit } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const c = credentials();
  let database = false;
  if (c.url && c.service) {
    try {
      const { error, status } = await admin()
        .from("ai_atlas_resources")
        .select("id")
        .limit(0);
      database = !error && status === 200;
    } catch {}
  }
  return NextResponse.json(
    {
      supabaseUrl: c.url,
      supabaseAnonKey: c.anon,
      database,
      ai: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      dailyLimit: dailyLimit(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
