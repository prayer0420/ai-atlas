import { NextRequest, NextResponse } from "next/server";
import { admin, authenticate, body, checkDb, errorResponse, AppError } from "@/lib/server";
import { usernameHint, usernameSchema } from "@/lib/username";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  try {
    const { user } = await authenticate(req);
    const { data, error } = await admin().from("ai_atlas_login_names")
      .select("username").eq("user_id", user.id).maybeSingle();
    checkDb(error);
    return NextResponse.json({ username: data?.username || "" }, { headers });
  } catch (e) { return errorResponse(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await authenticate(req);
    const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase());
    if (!user.email || !allowed.includes(user.email.toLowerCase()))
      throw new AppError("운영자가 허용한 계정만 아이디를 설정할 수 있습니다.", 403);
    const input = await body(req);
    const parsed = usernameSchema.safeParse(input?.username);
    if (!parsed.success) throw new AppError(usernameHint);
    const { error } = await admin().from("ai_atlas_login_names")
      .upsert({ user_id: user.id, username: parsed.data }, { onConflict: "user_id" });
    if (error?.code === "23505") throw new AppError("이미 사용 중인 아이디입니다.", 409);
    checkDb(error);
    return NextResponse.json({ username: parsed.data }, { headers });
  } catch (e) { return errorResponse(e); }
}
