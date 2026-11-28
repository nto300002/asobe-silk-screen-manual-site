import { errorReply } from "@/lib/skill-db";
import { getSkillAccount } from "@/lib/access-auth";
import { parseBody, reply, skillDb } from "@/lib/skill-db";
import { linkExistingParticipant } from "@/lib/account-records.mjs";
import { auditStatement } from "@/lib/audit-log.mjs";
import { rejectWriteRequest } from "@/lib/write-request.mjs";

async function requireAdmin() {
  const account = await getSkillAccount();
  if (!account) return { response: reply({ error: "ログインしてください" }, 401) };
  if (!account.active || account.role !== "admin") return { response: reply({ error: "管理者のみ利用できます" }, 403) };
  return { account };
}

async function GETHandler() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const db = skillDb();
  const [accounts, users] = await Promise.all([
    db.prepare(`SELECT a.access_sub AS accessSub, a.email, a.role, a.active,
      a.user_id AS userId, u.name AS displayName, a.approved_at AS approvedAt,
      (SELECT COUNT(*) FROM progress p WHERE p.user_id = a.user_id) AS progressCount,
      a.last_seen_at AS lastSeenAt FROM account_identities a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.last_seen_at DESC`).all(),
    db.prepare(`SELECT u.id, u.name, u.name_key AS nameKey,
      (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id) AS progressCount,
      (SELECT a.access_sub FROM account_identities a WHERE a.user_id = u.id) AS linkedSub
      FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at, u.id`).all(),
  ]);
  return reply({ accounts: accounts.results, users: users.results, currentAccessSub: auth.account!.sub });
}

async function PATCHHandler(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const input = await parseBody(request);
  const subject = input?.accessSub;
  const role = input?.role;
  const active = input?.active;
  const userId = input?.userId;
  const progressChoice = input?.progressChoice;
  const confirmedName = typeof input?.confirmedName === "string" ? input.confirmedName.trim() : "";
  const identityConfirmed = input?.identityConfirmed === true;
  if (typeof subject !== "string" || !subject ||
    !["provisional", "participant", "staff", "admin"].includes(String(role)) ||
    typeof active !== "boolean") {
    return reply({ error: "アカウントの設定が正しくありません" }, 400);
  }
  if (subject === auth.account!.sub && (!active || role !== "admin")) {
    return reply({ error: "自分の管理者権限はこの画面で解除できません" }, 400);
  }
  const db = skillDb();
  const current = await db.prepare(`SELECT role, active, user_id AS userId, approved_at AS approvedAt
    FROM account_identities WHERE access_sub = ?`).bind(subject)
    .first<{ role: string; active: number; userId: number | null; approvedAt: string | null }>();
  if (!current) return reply({ error: "アカウントが見つかりません" }, 404);
  if ((role === "staff" || role === "admin") && role !== current.role) {
    return reply({ error: "職員・管理者の設定には管理者のパスキー認証と登録許可が必要です" }, 403);
  }
  const approving = current.role === "provisional" && role === "participant";
  const merging = approving && current.userId !== userId;
  if (current.role === "participant" && role === "participant" && current.userId !== userId) {
    return reply({ error: "登録済みの利用者記録はこの画面で変更できません" }, 400);
  }
  if (approving && (!active || !identityConfirmed || !confirmedName || confirmedName.length > 40 || !Number.isInteger(userId) || Number(userId) < 1)) {
    return reply({ error: "本人確認、氏名、紐付ける利用者記録を指定してください" }, 400);
  }
  if (role === "participant" && (!Number.isInteger(userId) || Number(userId) < 1)) {
    return reply({ error: "利用者記録を選んでください" }, 400);
  }
  if (merging && !["existing", "chatgpt"].includes(String(progressChoice))) {
    return reply({ error: "引き継ぐ進捗を選んでください" }, 400);
  }
  if (role === "participant") {
    const user = await db.prepare("SELECT id, name, name_key AS nameKey FROM users WHERE id = ?")
      .bind(userId).first<{ id: number; name: string; nameKey: string }>();
    if (!user) return reply({ error: "利用者記録が見つかりません" }, 404);
    if (approving && user.nameKey !== `chatgpt:${subject}` && user.name !== confirmedName) {
      return reply({ error: "確認した氏名と利用者記録の氏名が一致しません" }, 409);
    }
    const linked = await db.prepare("SELECT access_sub FROM account_identities WHERE user_id = ? AND access_sub <> ?")
      .bind(userId, subject).first();
    if (linked) return reply({ error: "この利用者記録は別のアカウントに紐付いています" }, 409);
  }
  if (approving) {
    const approvalStatements = [
      db.prepare(`UPDATE users SET name = ? WHERE id = ? AND name_key = ?`)
        .bind(confirmedName, userId, `chatgpt:${subject}`),
      db.prepare(`UPDATE account_identities SET role = 'participant', active = 1,
        user_id = ?, approved_at = ? WHERE access_sub = ? AND role = 'provisional'`)
        .bind(userId, new Date().toISOString(), subject),
      db.prepare("DELETE FROM edit_grants WHERE access_sub = ?").bind(subject),
      auditStatement(db, auth.account!.sub, 'skill.account.approve',
        `account:${subject}:participant:active${merging ? `:progress:${progressChoice}` : ''}`),
    ];
    try { await linkExistingParticipant(db, subject, userId, progressChoice, auth.account!.sub, approvalStatements); }
    catch (error) {
      if (error instanceof Error && error.message === "PARTICIPANT_ALREADY_LINKED") return reply({ error: "この利用者記録は別のアカウントに紐付いています" }, 409);
      if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") return reply({ error: "アカウントが見つかりません" }, 404);
      if (error instanceof Error && error.message === "PROGRESS_CHOICE_REQUIRED") return reply({ error: "引き継ぐ進捗を選んでください" }, 400);
      throw error;
    }
    return reply({ ok: true });
  }
  const result = await db.prepare(`UPDATE account_identities SET role = ?, active = ?,
    user_id = CASE WHEN ? = 'participant' THEN ? ELSE user_id END,
    approved_at = CASE WHEN ? = 'provisional' THEN NULL WHEN ? THEN ? ELSE approved_at END
    WHERE access_sub = ?`)
    .bind(role, active ? 1 : 0, role, role === "participant" ? userId : null,
      role, approving ? 1 : 0, approving ? new Date().toISOString() : null, subject).run();
  if (!result.meta.changes) return reply({ error: "アカウントが見つかりません" }, 404);
  await db.prepare("DELETE FROM edit_grants WHERE access_sub = ?").bind(subject).run();
  if (!active) {
    await db.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(subject).run();
  }
  await auditStatement(db, auth.account!.sub, 'skill.account.update',
    `account:${subject}:${role}:${active ? 'active' : 'inactive'}`).run();
  return reply({ ok: true });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const PATCH = (...args: Parameters<typeof PATCHHandler>) => PATCHHandler(...args).catch(errorReply);
