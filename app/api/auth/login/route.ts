import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { admin, body, credentials } from "@/lib/server";
import { usernameSchema } from "@/lib/username";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const denied = () => NextResponse.json({ error: "아이디 또는 비밀번호를 확인해 주세요. 여러 번 시도했다면 15분 후 다시 로그인해 주세요." }, { status: 401, headers });

export async function POST(req: NextRequest) {
  try {
    const input = await body(req);
    const name = usernameSchema.safeParse(input?.username);
    if (!name.success || typeof input?.password !== "string" || input.password.length < 1 || input.password.length > 128)
      return denied();
    const service = admin();
    const reserved = await service.rpc("ai_atlas_reserve_login", { p_username: name.data });
    if (reserved.error) throw new Error("Login lookup unavailable");
    if (!reserved.data) return denied();
    const { data, error } = await service.auth.admin.getUserById(reserved.data);
    const email = data.user?.email;
    const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase());
    if (error || !email || !allowed.includes(email.toLowerCase())) return denied();
    const c = credentials();
    const auth = createClient(c.url, c.anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({ email, password: input.password });
    if (signed.error || !signed.data.session) return denied();
    return NextResponse.json({
      access_token: signed.data.session.access_token,
      refresh_token: signed.data.session.refresh_token,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers });
  }
}
