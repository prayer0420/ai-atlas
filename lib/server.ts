import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured } from "./ai-config";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function credentials() {
  return {
    url: process.env.SUPABASE_URL || "",
    anon: process.env.SUPABASE_ANON_KEY || "",
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}
export function admin() {
  const c = credentials();
  if (!c.url || !c.service)
    throw new AppError("저장소 연결 설정이 필요합니다.", 503);
  return createClient(c.url, c.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new AppError("로그인이 필요합니다.", 401);
  const c = credentials();
  if (!c.url || !c.anon)
    throw new AppError("저장소 연결 설정이 필요합니다.", 503);
  const db = createClient(c.url, c.anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new AppError("로그인이 만료되었습니다. 다시 로그인해 주세요.", 401);
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!data.user.email || !allowed.includes(data.user.email.toLowerCase()))
    throw new AppError("이 자료실에 접근할 수 없는 계정입니다.", 403);
  return { db, user: data.user };
}
export async function body(req: NextRequest) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 300000) throw new AppError("입력한 내용이 너무 큽니다.", 413);
  // Enforce the limit while streaming even when Content-Length is omitted.
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("입력 형식을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 300000) {
        await reader.cancel();
        throw new AppError("입력한 내용이 너무 큽니다.", 413);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("입력 형식을 확인해 주세요.");
  }
}
export function errorResponse(e: unknown) {
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        error:
          "입력 내용을 확인해 주세요. 제목은 120자, 본문은 60,000자까지 저장할 수 있습니다.",
      },
      { status: 400 },
    );
  console.error("Request failed:", e instanceof Error ? e.name : "unknown");
  return NextResponse.json(
    { error: "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 500 },
  );
}
export function checkDb(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205")
    throw new AppError(
      "자료 저장 테이블 설정이 아직 완료되지 않았습니다.",
      503,
    );
  throw new AppError(
    "저장소 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    500,
  );
}
export function dailyLimit() {
  const n = Number(process.env.DAILY_ANALYSIS_LIMIT || 20);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 20;
}
export function ensureAIAllowed(email?: string) {
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase()))
    throw new AppError(
      "이 계정은 AI 분석이 허용되지 않았습니다. 운영자의 허용 계정 설정을 확인해 주세요.",
      403,
    );
  if (!aiConfigured())
    throw new AppError(
      "AI API 키가 아직 연결되지 않았습니다. 원문은 저장되어 있으며, 연결 후 분석할 수 있습니다.",
      503,
    );
}
export const uuid = z.string().uuid();
