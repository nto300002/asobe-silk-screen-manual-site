"use client";

import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { passkeyErrorMessage } from "@/lib/passkey-errors.mjs";
import "../passkey/passkey.css";

type Account = { accessSub: string; email: string; displayName: string | null; role: string; active: number };

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", ...options, signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error("通信に失敗しました。接続を確認してください。"); }
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "操作できませんでした");
  return data;
}

export default function AdminEnrollment() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accessSub, setAccessSub] = useState("");
  const [targetRole, setTargetRole] = useState<"staff" | "admin">("staff");
  const [confirmedName, setConfirmedName] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    json<{ accounts: Account[] }>("/api/admin/accounts").then(result => {
      const candidates = result.accounts.filter(account => account.active && ["provisional", "participant"].includes(account.role));
      setAccounts(candidates);
      const requested = new URLSearchParams(window.location.search).get("account");
      if (requested && candidates.some(account => account.accessSub === requested)) setAccessSub(requested);
    }).catch(error => setMessage(error instanceof Error ? error.message : "候補者を読み込めませんでした"));
  }, []);

  const selected = accounts.find(account => account.accessSub === accessSub);

  async function permit() {
    setMessage(""); setSuccess(false);
    if (!selected || !identityConfirmed || !confirmedName.trim()) {
      setMessage("対象者を選び、本人に確認した氏名と確認済みのチェックを入力してください。");
      return;
    }
    setBusy(true);
    try {
      const options = await json<PublicKeyCredentialRequestOptionsJSON>("/api/passkey/authentication");
      const credential = await startAuthentication({ optionsJSON: options });
      await json("/api/passkey/authentication", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential),
      });
      await json("/api/admin/staff-enrollment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessSub, targetRole, confirmedName: confirmedName.trim(), identityConfirmed: true }),
      });
      setSuccess(true);
      setMessage(`${selected.email} の登録を10分間許可しました。本人にこのページを開き、パスキーを登録してもらってください。`);
    } catch (error) { setMessage(passkeyErrorMessage(error, "authenticate")); }
    finally { setBusy(false); }
  }

  return <main className="passkey-page"><div className="passkey-layout">
    <a className="passkey-back" href="/passkey?tab=accounts">← アカウント管理へ戻る</a>
    <header className="passkey-heading"><span className="passkey-eyebrow">STAFF SECURITY</span><h1>職員・管理者として設定</h1>
      <p>本人とアカウントを確認した後、管理者パスキーで10分間の登録許可を発行します。</p></header>
    <section className="passkey-card staff-enrollment-card">
      <h2>登録する人を確認</h2>
      <label>対象アカウント <select value={accessSub} onChange={event => { setAccessSub(event.target.value); setIdentityConfirmed(false); setConfirmedName(""); }}>
        <option value="">選択してください</option>
        {accounts.map(account => <option key={account.accessSub} value={account.accessSub}>{account.email}（{account.role === "provisional" ? "承認待ち利用者" : "利用者"}）</option>)}
      </select></label>
      {selected && <p className="staff-enrollment-account-id">アカウントID：{selected.accessSub}</p>}
      <label>本人に確認した氏名 <input value={confirmedName} onChange={event => setConfirmedName(event.target.value)} maxLength={40} /></label>
      <label>付与する権限 <select value={targetRole} onChange={event => setTargetRole(event.target.value as "staff" | "admin")}>
        <option value="staff">職員</option><option value="admin">管理者</option>
      </select></label>
      <label className="staff-enrollment-confirm"><input type="checkbox" checked={identityConfirmed} onChange={event => setIdentityConfirmed(event.target.checked)} /> 本人にアカウントと氏名を確認しました</label>
      <button className="passkey-primary" type="button" disabled={busy || !selected} onClick={permit}>
        {busy ? "本人確認をしています…" : "管理者パスキーで10分間の登録許可を発行"}
      </button>
      {message && <p className={`passkey-notice ${success ? "is-success" : "is-error"}`} role={success ? "status" : "alert"}>{message}</p>}
    </section>
    <p className="passkey-footnote">登録許可後、本人が自分のChatGPTアカウントでこのページを開くと、職員用パスキー登録画面が表示されます。</p>
  </div></main>;
}
