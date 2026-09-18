"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KeyRound, LoaderCircle } from "lucide-react";
import { usernameHint, usernameSchema } from "@/lib/username";

export function PasswordSettings({ client }: { client: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [username, setUsername] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameReady, setNameReady] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      const token = (await client.auth.getSession()).data.session?.access_token;
      const response = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (live) { setUsername(result.username); setNameReady(true); }
    })().catch(() => { if (live) setNameMessage("아이디를 불러오지 못했습니다. 설정 화면을 다시 열어 주세요."); });
    return () => { live = false; };
  }, [client]);

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) { setNameMessage(usernameHint); return; }
    setNameBusy(true);
    setNameMessage("");
    try {
      const token = (await client.auth.getSession()).data.session?.access_token;
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: parsed.data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "아이디를 저장하지 못했습니다.");
      setUsername(result.username);
      setNameMessage(`아이디를 ${result.username}(으)로 저장했습니다. 기존 비밀번호는 그대로 사용하세요.`);
    } catch (error) {
      setNameMessage(error instanceof Error ? error.message : "아이디를 저장하지 못했습니다.");
    } finally { setNameBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("new-password") || "");
    setMessage("");
    setFailed(false);
    if (password.length < 8 || password !== data.get("confirm-password")) {
      setFailed(true);
      setMessage("8자 이상의 비밀번호를 두 칸에 동일하게 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      form.reset();
      setMessage("비밀번호를 저장했습니다. 아이디와 새 비밀번호로 바로 들어오세요.");
    } catch (error) {
      setFailed(true);
      const code = (error as { code?: string }).code;
      setMessage(code === "same_password"
        ? "이미 사용 중인 비밀번호입니다. 이 비밀번호로 로그인할 수 있습니다."
        : code === "weak_password"
          ? "더 긴 비밀번호를 사용하고 영문·숫자·기호를 조합해 주세요."
          : "비밀번호를 저장하지 못했습니다. 현재 로그인 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <section className="setting-card full">
      <h2>로그인 아이디</h2>
      <p>원하는 아이디를 정하세요. 아이디를 바꿔도 자료와 비밀번호는 그대로입니다.</p>
      <form className="password-settings-form" onSubmit={saveUsername}>
        <label htmlFor="account-username">아이디</label>
        <input id="account-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={30} required disabled={!nameReady || nameBusy} aria-describedby="username-hint" />
        <p id="username-hint" className="small-copy">{usernameHint}</p>
        {nameMessage && <p className="notice" role="status">{nameMessage}</p>}
        <button className="primary-button" disabled={!nameReady || nameBusy}>{nameBusy ? "저장 중…" : "아이디 저장"}</button>
      </form>
    </section>
    <section className="setting-card full">
      <div className="setting-icon"><KeyRound /></div>
      <h2>비밀번호 설정</h2>
      <p>아이디와 함께 사용할 비밀번호입니다. 이미 설정했다면 그대로 사용해도 됩니다.</p>
      <form className="password-settings-form" onSubmit={save}>
        <label htmlFor="account-password">새 비밀번호</label>
        <input id="account-password" name="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} placeholder="8자 이상 입력" />
        <label htmlFor="account-password-confirm">비밀번호 확인</label>
        <input id="account-password-confirm" name="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} placeholder="한 번 더 입력" />
        {message && <p className={failed ? "form-error" : "notice"} role={failed ? "alert" : "status"}>{message}</p>}
        <button className="primary-button" disabled={busy}>
          {busy && <LoaderCircle size={17} className="spin" />}
          {busy ? "저장 중…" : "비밀번호 저장"}
        </button>
      </form>
    </section>
    </>
  );
}
