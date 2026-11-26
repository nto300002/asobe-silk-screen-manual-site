"use client";

import { useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { ArrowLeft, ArrowRight, Check, Clock3, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { passkeyErrorMessage } from "@/lib/passkey-errors.mjs";
import AccountManager from "../staff/account-manager";
import TutorialSpotlight from "../tutorial-spotlight";
import "./passkey.css";

type Status = { registered: boolean; editingUnlocked: boolean; expiresAt: number | null };
type Notice = { kind: "success" | "error"; text: string };

async function json<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options, signal: AbortSignal.timeout(20000) });
  let result: T & { error?: string };
  try { result = await response.json() as T & { error?: string }; }
  catch { throw new Error("サーバーの応答を読み取れませんでした。ページを再読み込みしてください。"); }
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "操作できませんでした。もう一度お試しください。");
  return result;
}

function remainingTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PasskeyPage({returnTo="/"}:{returnTo?:string}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<"edit" | "accounts">("edit");
  const [showTabTutorial, setShowTabTutorial] = useState(false);
  const closeTabTutorial = useCallback(() => { sessionStorage.removeItem("skill-permission-tutorial"); setShowTabTutorial(false); }, []);

  useEffect(() => {
    json<Status>("/api/passkey/status").then(result => { setStatus(result); setNow(Date.now()); }).catch(error => setNotice({ kind: "error", text: passkeyErrorMessage(error, "status") }));
    json<{ admin: boolean }>("/api/admin/session").then(result => {
      setIsAdmin(result.admin);
      if (result.admin && new URLSearchParams(window.location.search).get("tab") === "accounts") setTab("accounts");
      if (result.admin && sessionStorage.getItem("skill-permission-tutorial") === "accounts-tab") setShowTabTutorial(true);
    }).catch(() => {});
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => json<Status>("/api/passkey/status").then(setStatus).catch(() => {});
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const secondsLeft = status?.expiresAt ? Math.max(0, Math.ceil((status.expiresAt - now) / 1000)) : 0;
  const unlocked = Boolean(status?.editingUnlocked && secondsLeft > 0);

  async function register() {
    setBusy(true); setNotice(null);
    try {
      const options = await json<PublicKeyCredentialCreationOptionsJSON>("/api/passkey/registration");
      const credential = await startRegistration({ optionsJSON: options });
      await json("/api/passkey/registration", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential),
      });
      setStatus(await json<Status>("/api/passkey/status"));
      setNotice({ kind: "success", text: "パスキーを登録しました。次に、本人確認をして編集を許可してください。" });
    } catch (error) {
      setNotice({ kind: "error", text: passkeyErrorMessage(error, "register") });
    } finally { setBusy(false); }
  }

  async function unlock() {
    setBusy(true); setNotice(null);
    try {
      const options = await json<PublicKeyCredentialRequestOptionsJSON>("/api/passkey/authentication");
      const credential = await startAuthentication({ optionsJSON: options });
      await json("/api/passkey/authentication", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential),
      });
      setStatus(await json<Status>("/api/passkey/status"));
      setNow(Date.now());
      setNotice({ kind: "success", text: "本人確認が完了しました。編集画面へ戻れます。" });
    } catch (error) {
      setNotice({ kind: "error", text: passkeyErrorMessage(error, "authenticate") });
    } finally { setBusy(false); }
  }

  return <main className="passkey-page">
    <div className="passkey-layout">
      <a className="passkey-back" href={returnTo}><ArrowLeft size={17} aria-hidden="true" /> 編集画面へ戻る</a>
      <header className="passkey-heading">
        <div className="passkey-heading-top"><span className="passkey-eyebrow"><span className="passkey-eyebrow-line" /> STAFF SECURITY</span></div>
        <h1>設定</h1>
        <p>編集用の本人確認と、利用者・職員のアカウント管理を行います。</p>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="設定メニュー">
        <button type="button" role="tab" aria-selected={tab === "edit"} className={tab === "edit" ? "is-active" : ""} onClick={() => setTab("edit")}>編集権限</button>
        {isAdmin && <button type="button" role="tab" data-tutorial="accounts-tab" aria-selected={tab === "accounts"} className={tab === "accounts" ? "is-active" : ""} onClick={() => { setTab("accounts"); if (sessionStorage.getItem("skill-permission-tutorial") === "accounts-tab") { sessionStorage.setItem("skill-permission-tutorial", "role"); setShowTabTutorial(false); } }}>アカウント管理</button>}
      </div>

      {tab === "edit" && <>

      <section className="passkey-card" aria-label="編集の準備">
        <div className="passkey-card-head">
          <div className="passkey-card-icon"><ShieldCheck size={27} strokeWidth={1.8} aria-hidden="true" /></div>
          <div>
            <span className="passkey-section-label">現在の状態</span>
            <h2>{!status ? (notice?.kind === "error" ? "状態を確認できませんでした" : "状態を確認しています") : unlocked ? "いま編集できます" : status.registered ? "編集前に本人確認が必要です" : "最初にパスキーを登録します"}</h2>
          </div>
        </div>

        <div className="passkey-status-grid" aria-live="polite">
          <div className={`passkey-status ${status?.registered ? "is-complete" : ""}`}>
            <span className="passkey-status-icon">{status?.registered ? <Check size={18} /> : <KeyRound size={18} />}</span>
            <span><strong>パスキー登録</strong><small>{!status ? "確認中" : status.registered ? "登録済み" : "未登録"}</small></span>
          </div>
          <div className={`passkey-status ${unlocked ? "is-active" : ""}`}>
            <span className="passkey-status-icon">{unlocked ? <Check size={18} /> : <LockKeyhole size={18} />}</span>
            <span><strong>編集の許可</strong><small>{unlocked ? `有効・残り ${remainingTime(secondsLeft)}` : "本人確認が必要"}</small></span>
          </div>
        </div>

        {status && <div className="passkey-action">
          {!status.registered ? <>
            <h3>1. パスキーを登録</h3>
            <p>端末に表示される案内に従い、顔認証・指紋認証・画面ロックなどで登録します。登録後に編集用の本人確認へ進めます。</p>
            <button className="passkey-primary" type="button" disabled={busy} onClick={register}>
              <Fingerprint size={20} aria-hidden="true" />{busy ? "登録しています…" : "パスキーを登録する"}<ArrowRight size={18} aria-hidden="true" />
            </button>
          </> : unlocked ? <>
            <h3>編集の準備ができました</h3>
            <p>編集許可は残り <strong>{remainingTime(secondsLeft)}</strong> です。期限が切れたら、この画面で再度パスキー認証してください。</p>
            <a className="passkey-primary" href={returnTo}><Check size={19} aria-hidden="true" />編集画面へ戻る<ArrowRight size={18} aria-hidden="true" /></a>
          </> : <>
            <h3>2. パスキーで本人確認</h3>
            <p>登録済みのパスキーで確認すると、工程・マニュアル・写真を <strong>15分間</strong> 編集できます。</p>
            <button className="passkey-primary" type="button" disabled={busy} onClick={unlock}>
              <Fingerprint size={20} aria-hidden="true" />{busy ? "確認しています…" : "パスキーで編集を許可する"}<ArrowRight size={18} aria-hidden="true" />
            </button>
          </>}
        </div>}
        {notice && <p className={`passkey-notice is-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
      </section>

      <p className="passkey-footnote"><Clock3 size={17} aria-hidden="true" /> この確認は編集のためのものです。スキルチェックの閲覧や進捗の記録には必要ありません。</p>
      </>}
      {tab === "accounts" && isAdmin && <AccountManager />}
    </div>
    {showTabTutorial && <TutorialSpotlight target="[data-tutorial='accounts-tab']" instruction="設定画面では「編集権限」と「アカウント管理」を切り替えます。ここを押してアカウント管理を開きます。" onClose={closeTabTutorial} />}
  </main>;
}
