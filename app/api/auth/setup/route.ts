import { NextRequest, NextResponse } from "next/server";
import { admin, authenticate, body, checkDb, errorResponse } from "@/lib/server";
import { usernameSchema } from "@/lib/username";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    // A login name is not proof of ownership. Verify the session BEFORE using
    // the service-role client, and only ever change that session's own user.
    const { user } = await authenticate(req);
    const input = await body(req);
    const parsed = usernameSchema.safeParse(input?.username);
    const password = input?.password;
    if (!parsed.success || typeof password !== "string" || password.length < 8 || password.length > 128)
      return NextResponse.json({ error: "아이디와 8자 이상의 비밀번호를 입력해 주세요." }, { status: 400, headers });

    const service = admin();
    const { data: row, error: lookupError } = await service.from("ai_atlas_login_names")
      .select("user_id, username, initial_password_set").eq("user_id", user.id).maybeSingle();
    checkDb(lookupError);
    if (!row || row.username !== parsed.data)
      return NextResponse.json({ error: "본인 계정만 설정할 수 있습니다." }, { status: 403, headers });
    if (!row || row.initial_password_set) return NextResponse.json({ error: "초기 비밀번호는 이미 설정되었습니다. 해당 비밀번호로 로그인해 주세요." }, { status: 409, headers });
    const { data: userData, error: userError } = await service.auth.admin.getUserById(row.user_id);
    const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (userError || !userData.user?.email || !allowed.includes(userData.user.email.toLowerCase()))
      return NextResponse.json({ error: "이 계정은 초기 설정 대상이 아닙니다." }, { status: 403, headers });
    const { error: passwordError } = await service.auth.admin.updateUserById(user.id, { password });
    if (passwordError) throw passwordError;
    const { error: markError } = await service.from("ai_atlas_login_names")
      .update({ initial_password_set: true }).eq("user_id", row.user_id).eq("initial_password_set", false);
    checkDb(markError);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
