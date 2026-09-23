import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

/** Tab focus can emit SIGNED_IN again for the same account. Keep its open editor. */
export function clearSelectionForAuth(event: AuthChangeEvent, previousId: string | undefined, nextId: string | undefined) {
  return event === "SIGNED_OUT" || (!!previousId && previousId !== nextId);
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
): Promise<{ session: Session | null; callback: boolean }> {
  const callback = parseAuthCallback(href);
  if (callback?.kind === "error") throw new Error(callback.message);
  if (callback?.kind === "pkce") {
    const { error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
  } else if (callback?.kind === "implicit") {
    const { error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return { session: data.session, callback: Boolean(callback) };
}
