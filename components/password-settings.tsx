"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KeyRound, LoaderCircle } from "lucide-react";

export function PasswordSettings({ client, email }: { client: SupabaseClient; email: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

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
      setMessage("비밀번호를 저장했습니다. 다음부터 아래 로그인 ID와 비밀번호로 바로 들어오세요.");
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
    <section className="setting-card full">
      <div className="setting-icon"><KeyRound /></div>
      <h2>비밀번호 설정</h2>
      <p>한 번 설정하면 이메일 인증 없이 로그인할 수 있습니다. 기존 자료는 그대로 이어집니다.</p>
      <p>로그인 ID: <strong>{email}</strong></p>
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
  );
}
