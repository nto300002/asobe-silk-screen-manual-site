"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { passkeyErrorMessage } from "@/lib/passkey-errors.mjs";
import "../passkey/passkey.css";

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "操作できませんでした");
  return data;
}

export default function StaffEnrollmentClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function register() {
    setBusy(true); setMessage("");
    try {
      const options = await json<PublicKeyCredentialCreationOptionsJSON>("/api/passkey/registration");
      const credential = await startRegistration({ optionsJSON: options });
      await json("/api/passkey/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      router.push("/passkey");
    } catch (error) { setMessage(passkeyErrorMessage(error, "register")); }
    finally { setBusy(false); }
  }
  return <main className="passkey-page"><div className="passkey-layout">
    <Link className="passkey-back" href="/">← スキルチェックへ戻る</Link>
    <header className="passkey-heading"><h1>職員用パスキーの登録</h1><p>管理者から登録許可を受けたアカウントで、パスキーを登録します。許可は10分間有効です。</p></header>
    <section className="passkey-card"><h2>本人の端末で登録</h2><p>顔認証・指紋認証・画面ロックを使います。登録後に職員権限が有効になります。</p>
      <button className="passkey-primary" type="button" disabled={busy} onClick={register}>{busy ? "登録しています…" : "パスキーを登録する"}</button>
      {message && <p className="passkey-notice is-error" role="alert">{message}</p>}
    </section>
  </div></main>;
}
