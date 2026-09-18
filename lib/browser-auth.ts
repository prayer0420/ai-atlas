import type { Session, SupabaseClient } from "@supabase/supabase-js";

const sessionBackupKey = "ai-atlas-auth-backup";

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SessionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function saveSessionBackup(session: Session, storage = browserStorage()) {
  if (!storage) return;
  storage.setItem(
    sessionBackupKey,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  );
}

function readSessionBackup(storage = browserStorage()) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(sessionBackupKey) || "null");
    if (
      typeof value?.access_token === "string" &&
      typeof value?.refresh_token === "string"
    )
      return value as { access_token: string; refresh_token: string };
  } catch {
    storage.removeItem(sessionBackupKey);
  }
  return null;
}

export function clearBrowserSessionBackup(storage = browserStorage()) {
  storage?.removeItem(sessionBackupKey);
}

export type AuthCallback =
  | { kind: "implicit"; accessToken: string; refreshToken: string }
  | { kind: "pkce"; code: string }
  | { kind: "error"; message: string }
  | null;

const callbackKeys = [
  "code",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "type",
];

export function parseAuthCallback(input: string): AuthCallback {
  const url = new URL(input);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const read = (key: string) => url.searchParams.get(key) || hash.get(key);
  const message = read("error_description") || read("error");
  if (message) return { kind: "error", message };
  const code = url.searchParams.get("code");
  if (code) return { kind: "pkce", code };
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken)
    return { kind: "implicit", accessToken, refreshToken };
  return null;
}

export function cleanAuthCallbackUrl(input: string) {
  const url = new URL(input);
  for (const key of callbackKeys) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const key of callbackKeys) hash.delete(key);
  const query = url.searchParams.toString();
  const fragment = hash.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`;
}

export async function restoreBrowserSession(
  client: SupabaseClient,
  href: string,
  storage = browserStorage(),
): Promise<{ session: Session | null; callback: boolean }> {
  const callback = parseAuthCallback(href);
  if (callback?.kind === "error") throw new Error(callback.message);
  if (callback?.kind === "pkce") {
    const { error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
  } else if (callback?.kind === "implicit") {
    const { data, error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    if (data.session) saveSessionBackup(data.session, storage);
  }
  let { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const backup = readSessionBackup(storage);
    if (backup) {
      const restored = await client.auth.setSession(backup);
      if (restored.error) {
        clearBrowserSessionBackup(storage);
        throw restored.error;
      }
      data = { session: restored.data.session };
    }
  }
  if (data.session) saveSessionBackup(data.session, storage);
  return { session: data.session, callback: Boolean(callback) };
}
