import { NextRequest, NextResponse } from "next/server";
import { admin, authenticate, body, checkDb, errorResponse } from "@/lib/server";
import { cardProfile } from "@/lib/card-service";
import { cardBriefSchema } from "@/lib/card-workflow";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try { const { user } = await authenticate(req); return NextResponse.json({ profile: await cardProfile(user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return errorResponse(e); }
}
export async function PUT(req: NextRequest) {
  try {
    const { user } = await authenticate(req);
    const profile = cardBriefSchema.parse(await body(req));
    profile.required = ""; // Topic-specific instructions are not a brand preference.
    checkDb((await admin().from("ai_atlas_preferences").upsert({ user_id: user.id, card_profile: profile })).error);
    return NextResponse.json({ profile });
  } catch (e) { return errorResponse(e); }
}
