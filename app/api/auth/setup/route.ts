import { NextRequest, NextResponse } from "next/server";
import { admin, body, checkDb } from "@/lib/server";
import { usernameSchema } from "@/lib/username";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    const input = await body(req);
    const parsed = usernameSchema.safeParse(input?.username);
    const password = input?.password;
    if (!parsed.success || typeof password !== "string" || password.length < 8 || password.length > 128)
      return NextResponse.json({ error: "아이디와 8자 이상의 비밀번호를 입력해 주세요." }, { status: 400, headers });

    const service = admin();
    const reserved = await service.rpc("ai_atlas_reserve_login", { p_username: parsed.data });
    if (reserved.error) throw reserved.error;
    if (!reserved.data) return NextResponse.json({ error: "초기 설정을 사용할 수 없습니다. 아이디를 확인하거나 잠시 후 다시 시도해 주세요." }, { status: 403, headers });
    const { data: row, error: lookupError } = await service.from("ai_atlas_login_names")
      .select("user_id, initial_password_set").eq("user_id", reserved.data).maybeSingle();
    checkDb(lookupError);
    if (!row || row.initial_password_set) return NextResponse.json({ error: "초기 비밀번호는 이미 설정되었습니다. 해당 비밀번호로 로그인해 주세요." }, { status: 409, headers });
    const { data: userData, error: userError } = await service.auth.admin.getUserById(row.user_id);
    const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (userError || !userData.user?.email || !allowed.includes(userData.user.email.toLowerCase()))
      return NextResponse.json({ error: "이 계정은 초기 설정 대상이 아닙니다." }, { status: 403, headers });
    const { error: passwordError } = await service.auth.admin.updateUserById(row.user_id, { password });
    if (passwordError) throw passwordError;
    const { error: markError } = await service.from("ai_atlas_login_names")
      .update({ initial_password_set: true }).eq("user_id", row.user_id).eq("initial_password_set", false);
    checkDb(markError);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "초기 비밀번호를 설정하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers });
  }
}
