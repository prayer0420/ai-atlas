import type { Session, SupabaseClient } from "@supabase/supabase-js";

const sessionBackupKey = "ai-atlas-auth-backup";

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const cookieChunkSize = 2800;

function cookieName(key: string) {
  return `aa_${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const item = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function expireCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export function createBrowserAuthStorage(): SessionStorage | null {
  if (typeof window === "undefined") return null;
  return {
    getItem(key) {
      try {
        const local = window.localStorage.getItem(key);
        if (local) return local;
      } catch {}
      const base = cookieName(key);
      const count = Number(readCookie(`${base}_n`) || "0");
      if (!Number.isInteger(count) || count < 1 || count > 20) return null;
      const chunks = Array.from({ length: count }, (_, index) =>
        readCookie(`${base}_${index}`),
      );
      if (chunks.some((chunk) => chunk === null)) return null;
      try {
        return decodeURIComponent(chunks.join(""));
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
      const base = cookieName(key);
      const previous = Number(readCookie(`${base}_n`) || "0");
      for (let index = 0; index < previous; index++)
        expireCookie(`${base}_${index}`);
      const encoded = encodeURIComponent(value);
      const chunks = encoded.match(new RegExp(`.{1,${cookieChunkSize}}`, "g")) || [];
      chunks.forEach((chunk, index) => {
        document.cookie = `${base}_${index}=${chunk}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
      });
      document.cookie = `${base}_n=${chunks.length}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
    },
    removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
      const base = cookieName(key);
      const count = Number(readCookie(`${base}_n`) || "0");
      for (let index = 0; index < count; index++)
        expireCookie(`${base}_${index}`);
      expireCookie(`${base}_n`);
    },
  };
}

function saveSessionBackup(session: Session, storage = createBrowserAuthStorage()) {
  if (!storage) return;
  storage.setItem(
    sessionBackupKey,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  );
}

function readSessionBackup(storage = createBrowserAuthStorage()) {
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

export function clearBrowserSessionBackup(storage = createBrowserAuthStorage()) {
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
  storage = createBrowserAuthStorage(),
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
