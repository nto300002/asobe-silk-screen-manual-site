"use client";

import { useCallback, useEffect, useState } from "react";
import TutorialSpotlight from "../tutorial-spotlight";
import AccountMessage from "./account-message";

type Account = { accessSub: string; email: string; displayName: string | null; role: string; active: number; userId: number | null; approvedAt: string | null; progressCount: number };
type User = { id: number; name: string; nameKey: string; progressCount: number; linkedSub: string | null };
type ProgressChoice = "existing" | "chatgpt";
type Audit = { id: number; actorSub: string; occurredAt: string; action: string; target: string };

function RequiredMark() {
  return <span className="account-required" title="必須">*<span className="sr-only">必須</span></span>;
}

async function api<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", ...options, signal: AbortSignal.timeout(20000) }); }
  catch (error) { throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "通信が時間内に完了しませんでした。画面を更新して結果を確認してください。" : "通信に失敗しました。接続を確認して再試行してください。"); }
  let result: T & { error?: string };
  try { result = await response.json() as T & { error?: string }; }
  catch { throw new Error("サーバーの応答を読み取れませんでした。画面を更新してください。"); }
  if (!response.ok) throw new Error(result.error ?? "操作できませんでした");
  return result;
}

export default function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [provisionalSubjects, setProvisionalSubjects] = useState<Set<string>>(new Set());
  const [sourceUserIds, setSourceUserIds] = useState<Record<string, number | null>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [currentAccessSub, setCurrentAccessSub] = useState("");
  const [tutorial, setTutorial] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmedNames, setConfirmedNames] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [approvalStep, setApprovalStep] = useState(0);
  const [approvalSubject, setApprovalSubject] = useState<string | null>(null);
  const [mergeSubject, setMergeSubject] = useState<string | null>(null);
  const [progressChoice, setProgressChoice] = useState<ProgressChoice | null>(null);
  const [savingSubject, setSavingSubject] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const closeTutorial = useCallback(() => { sessionStorage.removeItem("skill-permission-tutorial"); setTutorial(false); }, []);

  async function reload() {
    const [result, log] = await Promise.all([
      api<{ accounts: Account[]; users: User[]; currentAccessSub: string }>("/api/admin/accounts"),
      api<{ entries: Audit[] }>("/api/admin/audit"),
    ]);
    setProvisionalSubjects(new Set(result.accounts.filter(account => account.role === "provisional").map(account => account.accessSub)));
    setSourceUserIds(Object.fromEntries(result.accounts.map(account => [account.accessSub, account.userId])));
    setAccounts(result.accounts);
    setCurrentAccessSub(result.currentAccessSub);
    setUsers(result.users);
    setAudit(log.entries);
    setLoaded(true);
  }
  useEffect(() => { reload().catch(error => setMessage({ text: error.message, tone: "error" })); }, []);
  useEffect(() => { if (sessionStorage.getItem("skill-permission-tutorial") === "role") setTutorial(true); }, []);
  useEffect(() => {
    if (!mergeSubject) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMergeSubject(null); };
    document.addEventListener("keydown", onKeyDown);
    document.querySelector<HTMLInputElement>(".account-merge-dialog input[type='radio']")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mergeSubject]);

  async function save(account: Account, choice?: ProgressChoice) {
    setMessage(null);
    clearRowError(account.accessSub);
    const approving = provisionalSubjects.has(account.accessSub) && account.role === "participant";
    if (approving && account.userId !== null && account.userId !== sourceUserIds[account.accessSub] && !choice) {
      const name = confirmedNames[account.accessSub]?.trim();
      const selected = users.find(user => user.id === account.userId);
      if (!verified[account.accessSub] || !name || !selected || selected.name !== name) {
        setRowErrors(previous => ({ ...previous, [account.accessSub]: "本人確認、氏名、紐付ける利用者記録を確認してください" }));
        return;
      }
      setProgressChoice(null);
      setMergeSubject(account.accessSub);
      return;
    }
    setMergeSubject(null);
    setSavingSubject(account.accessSub);
    try {
      await api("/api/admin/accounts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...account, active: !!account.active,
          confirmedName: confirmedNames[account.accessSub], identityConfirmed: verified[account.accessSub] === true,
          progressChoice: choice }),
      });
      await reload();
      setMessage({ text: "アカウントを更新しました。", tone: "success" });
    } catch (error) { setRowErrors(previous => ({ ...previous, [account.accessSub]: error instanceof Error ? error.message : "更新できませんでした" })); }
    finally { setSavingSubject(null); }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      setNewName("");
      await reload();
      setMessage({ text: "利用者記録を追加しました。アカウントと紐付けてください。", tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "追加できませんでした", tone: "error" }); }
  }

  async function deleteUser(user: User) {
    setDeleting(true);
    setMessage(null);
    setDeleteError("");
    try {
      await api(`/api/users?userId=${user.id}`, { method: "DELETE" });
      setDeletingUserId(null);
      await reload();
      setMessage({ text: `「${user.name}」を利用者一覧から削除しました。進捗データは保持されています。`, tone: "success" });
    } catch (error) {
      const text = error instanceof Error ? error.message : "削除できませんでした";
      setDeleteError(text);
      setMessage({ text, tone: "error" });
    }
    finally { setDeleting(false); }
  }

  function change(subject: string, patch: Partial<Account>) {
    clearRowError(subject);
    setAccounts(previous => previous.map(item => item.accessSub === subject ? { ...item, ...patch } : item));
  }

  function clearRowError(subject: string) {
    setRowErrors(previous => {
      if (!previous[subject]) return previous;
      const next = { ...previous };
      delete next[subject];
      return next;
    });
  }

  const editable = accounts.find(account => account.accessSub !== currentAccessSub);
  const guided = accounts.find(account => account.accessSub === approvalSubject);
  const approvalSteps = guided ? [
    { target: "[data-approval-tutorial='account']", instruction: "まず本人に、このアカウントでサインインしたことと氏名を直接確認します。確認できるまでは承認しません。" },
    { target: "[data-approval-tutorial='role']", instruction: "確認できたら、区分で「利用者」を選びます。「次へ」で必要な入力欄を一時表示します。この案内では保存されません。" },
    { target: "[data-approval-tutorial='name']", instruction: "本人に確認した氏名を入力します。アカウントの表示名だけで判断せず、本人に確認した名前を使います。" },
    { target: "[data-approval-tutorial='record']", instruction: "以前から保存されている同じ氏名の利用者記録があれば、ここで選びます。なければ「新しい記録を使う」のまま進みます。" },
    { target: "[data-approval-tutorial='verified']", instruction: "アカウントと氏名の両方を確認した場合だけ、ここにチェックを入れます。" },
    { target: "[data-approval-tutorial='save']", instruction: "最後に「保存」を押すと利用者として正式に登録されます。この案内では保存しません。" },
  ] : [{ target: "[data-tutorial='account-list']", instruction: "現在、承認待ち利用者はいません。新たにサインインした人が表示されたら、この案内を開いて登録手順を確認できます。" }];
  function closeApproval() {
    if (approvalSubject && approvalStep >= 2) change(approvalSubject, { role: "provisional" });
    setApprovalSubject(null);
    setApprovalStep(0);
  }
  function nextApproval() {
    if (approvalStep === approvalSteps.length - 1) { closeApproval(); return; }
    if (approvalStep === 1 && approvalSubject) change(approvalSubject, { role: "participant" });
    setApprovalStep(step => step + 1);
  }
  function previousApproval() {
    if (approvalStep === 2 && approvalSubject) change(approvalSubject, { role: "provisional" });
    setApprovalStep(step => Math.max(0, step - 1));
  }
  return <section className="account-manager" role="tabpanel">
    <h2>アカウント管理</h2>
    <p>初回サインインの人は承認待ちです。本人に氏名とアカウントを確認し、利用者記録を選んで「利用者」に変更すると正式に使えます。職員設定はパスキーによる別の承認が必要です。</p>
    <form className="account-create" onSubmit={createUser}><label>新しい利用者名 <input value={newName} onChange={event => setNewName(event.target.value)} maxLength={40} required /></label> <button type="submit">利用者記録を作成</button></form>
    <h3>利用者記録</h3>
    {message && <AccountMessage text={message.text} tone={message.tone} />}
    <p>アカウントに紐付いていない利用者記録を削除できます。削除後は利用者の選択肢から外れ、進捗データは保持されます。</p>
    <ul className="account-user-records">
      {users.filter(user => !user.nameKey.startsWith("chatgpt:")).map(user => <li key={user.id}>
        <span><strong>{user.name}</strong><small>進捗 {user.progressCount}件{user.linkedSub ? " · アカウントに紐付け中" : ""}</small></span>
        {!user.linkedSub && <button type="button" className="account-delete-trigger" onClick={() => { setDeleteError(""); setDeletingUserId(user.id); }}>削除</button>}
      </li>)}
    </ul>
    <h3 data-tutorial="account-list">アカウント一覧</h3>
    {accounts.map(account => {
      const approvalRequired = provisionalSubjects.has(account.accessSub);
      return <section className="account-row" key={account.accessSub} aria-describedby={rowErrors[account.accessSub] ? `account-error-${account.accessSub}` : undefined}>
      <strong data-approval-tutorial={account.accessSub === approvalSubject ? "account" : undefined}>{account.email}{account.approvedAt && account.displayName ? <span className="account-linked-name">（{account.displayName}）</span> : null}</strong><small style={{ display: "block" }}>ID: {account.accessSub}</small>
      <label><span>区分 {approvalRequired && <RequiredMark />}</span><select required={approvalRequired} data-tutorial={account.accessSub === editable?.accessSub ? "account-role" : undefined} data-approval-tutorial={account.accessSub === approvalSubject ? "role" : undefined} value={account.role} onChange={event => { if (tutorial) closeTutorial(); if (approvalSubject === account.accessSub) closeApproval(); change(account.accessSub, { role: event.target.value }); }}>
        <option value="provisional">承認待ち利用者</option><option value="participant">利用者</option>
        {(account.role === "staff" || account.role === "admin") && <option value={account.role}>{account.role === "staff" ? "職員" : "管理者"}</option>}
      </select></label>
      {account.role === "provisional" && <div className="account-provisional-actions"><span className="account-provisional-note">承認待ちの場合画像を閲覧することができません</span><button type="button" className="account-approval-help" onClick={() => { if (tutorial) closeTutorial(); setApprovalStep(0); setApprovalSubject(account.accessSub); }}>利用者の登録方法</button></div>}{" "}
      {(account.role === "provisional" || (account.role === "participant" && !account.approvedAt)) && <div className="account-identity-check">
        <label data-approval-tutorial={account.accessSub === approvalSubject ? "name" : undefined}><span>本人に確認した氏名 {approvalRequired && <RequiredMark />}</span><input required={approvalRequired} maxLength={40} value={confirmedNames[account.accessSub] ?? ""} onChange={event => { clearRowError(account.accessSub); setConfirmedNames(previous => ({ ...previous, [account.accessSub]: event.target.value })); }} /></label>
        <label data-approval-tutorial={account.accessSub === approvalSubject ? "record" : undefined}><span>既存の利用者記録と統合</span><select value={account.userId === sourceUserIds[account.accessSub] ? "" : account.userId ?? ""} onChange={event => change(account.accessSub, { userId: Number(event.target.value) || sourceUserIds[account.accessSub] })}>
          <option value="">新しい記録を使う</option>{users.filter(user => !user.nameKey.startsWith("chatgpt:") && (!user.linkedSub || user.linkedSub === account.accessSub)).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select></label>
        <label data-approval-tutorial={account.accessSub === approvalSubject ? "verified" : undefined}><input type="checkbox" required={approvalRequired} checked={verified[account.accessSub] ?? false} onChange={event => { clearRowError(account.accessSub); setVerified(previous => ({ ...previous, [account.accessSub]: event.target.checked })); }} /> 本人にアカウントと氏名を確認しました {approvalRequired && <RequiredMark />}</label>
      </div>}{" "}
      {(account.role === "provisional" || account.role === "participant") && <a className="account-staff-link" href={`/staff-enrollment?account=${encodeURIComponent(account.accessSub)}`}>職員、管理者として設定したいとき →</a>}
      <label><input type="checkbox" checked={!!account.active} onChange={event => change(account.accessSub, { active: event.target.checked ? 1 : 0 })} /> 有効</label>{" "}
      <button type="button" disabled={savingSubject === account.accessSub} data-approval-tutorial={account.accessSub === approvalSubject ? "save" : undefined} onClick={() => save(account)}>{savingSubject === account.accessSub ? "保存中…" : "保存"}</button>
      {rowErrors[account.accessSub] && <AccountMessage text={rowErrors[account.accessSub]} tone="error" id={`account-error-${account.accessSub}`} className="account-row-error" />}
    </section>; })}
    <h3>操作記録</h3>
    <div className="account-audit">
      {audit.map(entry => <div className="account-audit-row" key={entry.id}>
        <time>{entry.occurredAt}</time>　{entry.actorSub}　{entry.action}　{entry.target}
      </div>)}
    </div>
    {tutorial && loaded && <TutorialSpotlight target={editable ? "[data-tutorial='account-role']" : "[data-tutorial='account-list']"} instruction={editable ? "本人確認後、利用者を選び、氏名と利用者記録を指定して保存してください。職員設定には別途パスキー認証が必要です。" : "対象者がChatGPTでサインインすると承認待ちとして一覧に表示されます。"} onClose={closeTutorial} />}
    {loaded && approvalSubject !== null && <TutorialSpotlight title="利用者の登録方法" target={approvalSteps[approvalStep].target} instruction={approvalSteps[approvalStep].instruction} step={approvalStep + 1} totalSteps={approvalSteps.length} onNext={nextApproval} onPrevious={approvalStep > 0 ? previousApproval : undefined} onClose={closeApproval} interactive={false} />}
    {mergeSubject && (() => {
      const account = accounts.find(item => item.accessSub === mergeSubject);
      const target = users.find(item => item.id === account?.userId);
      if (!account || !target) return null;
      return <div className="account-merge-backdrop" onClick={() => setMergeSubject(null)}>
        <div className="account-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="account-merge-title" onClick={event => event.stopPropagation()}>
          <h3 id="account-merge-title">引き継ぐ進捗を選択</h3>
          <p><strong>{account.email}</strong> を既存の利用者「<strong>{target.name}</strong>」に紐付けます。正式登録後はメールアドレスの横に氏名が表示されます。</p>
          <fieldset><legend>利用するチェック状況</legend>
            <label><input type="radio" name="progress-choice" checked={progressChoice === "existing"} onChange={() => setProgressChoice("existing")} /> 既存の利用者記録の進捗（{target.progressCount}件）</label>
            <label><input type="radio" name="progress-choice" checked={progressChoice === "chatgpt"} onChange={() => setProgressChoice("chatgpt")} /> ChatGPTアカウントの進捗（{account.progressCount}件）</label>
          </fieldset>
          <p className="account-merge-note">選ばなかった進捗も履歴として保管します。統合後の画面には選んだ進捗を表示します。</p>
          <div className="account-merge-actions"><button type="button" className="account-merge-cancel" onClick={() => setMergeSubject(null)}>戻る</button><button type="button" disabled={!progressChoice || savingSubject === account.accessSub} onClick={() => { if (progressChoice) void save(account, progressChoice); }}>この進捗で保存</button></div>
        </div>
      </div>;
    })()}
    {deletingUserId !== null && (() => {
      const user = users.find(item => item.id === deletingUserId);
      if (!user) return null;
      return <div className="account-merge-backdrop" onClick={() => { if (!deleting) setDeletingUserId(null); }}>
        <div className="account-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" onClick={event => event.stopPropagation()}>
          <h3 id="account-delete-title">利用者記録を削除</h3>
          <p>「<strong>{user.name}</strong>」を利用者一覧から削除します。進捗 {user.progressCount}件は保持されます。アカウントに紐付いている記録は削除できません。</p>
          {deleteError && <AccountMessage text={deleteError} tone="error" />}
          <div className="account-merge-actions"><button type="button" className="account-merge-cancel" disabled={deleting} onClick={() => setDeletingUserId(null)}>戻る</button><button type="button" className="account-delete-confirm" disabled={deleting} onClick={() => void deleteUser(user)}>{deleting ? "削除中…" : "削除する"}</button></div>
        </div>
      </div>;
    })()}
  </section>;
}
