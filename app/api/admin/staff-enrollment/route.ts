import { cookies } from "next/headers";
import { getSkillAccount } from "@/lib/access-auth";
import { errorReply, parseBody, reply, skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { auditStatement } from "@/lib/audit-log.mjs";

async function POSTHandler(request: Request) {
  const admin = await getSkillAccount();
  if (!admin) return reply({ error: "ログインしてください" }, 401);
  if (!admin.active || admin.role !== "admin") return reply({ error: "管理者のみ利用できます" }, 403);
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const token = (await cookies()).get("asobe_skill_edit_grant")?.value;
  const db = skillDb();
  const grant = token ? await db.prepare(`SELECT expires_at AS expiresAt FROM edit_grants
    WHERE access_sub = ? AND session_nonce = ?`).bind(admin.sub, token)
    .first<{ expiresAt: number }>() : null;
  if (!grant || grant.expiresAt < Date.now() + 13 * 60_000) {
    return reply({ error: "職員設定の直前に管理者パスキーで本人確認してください" }, 403);
  }
  const input = await parseBody(request);
  const accessSub = input?.accessSub;
  const targetRole = input?.targetRole;
  const confirmedName = typeof input?.confirmedName === "string" ? input.confirmedName.trim() : "";
  if (typeof accessSub !== "string" || !accessSub || !["staff", "admin"].includes(String(targetRole)) ||
      !confirmedName || confirmedName.length > 40 || input?.identityConfirmed !== true || accessSub === admin.sub) {
    return reply({ error: "対象アカウント、氏名、本人確認を指定してください" }, 400);
  }
  const target = await db.prepare(`SELECT role, active, user_id AS userId FROM account_identities WHERE access_sub = ?`)
    .bind(accessSub).first<{ role: string; active: number; userId: number | null }>();
  if (!target || !target.active || !["provisional", "participant"].includes(target.role)) {
    return reply({ error: "職員登録の対象が見つかりません" }, 409);
  }
  await db.batch([
    db.prepare(`INSERT INTO staff_enrollment_grants
      (access_sub, approved_by, target_role, confirmed_name, expires_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(access_sub) DO UPDATE SET approved_by = excluded.approved_by,
      target_role = excluded.target_role, confirmed_name = excluded.confirmed_name,
      expires_at = excluded.expires_at`)
      .bind(accessSub, admin.sub, targetRole, confirmedName, Date.now() + 10 * 60_000),
    auditStatement(db, admin.sub, "skill.staff.enrollment.grant", `account:${accessSub}:${targetRole}`),
  ]);
  return reply({ ok: true, expiresInSeconds: 600 });
}

export const POST = (...args: Parameters<typeof POSTHandler>) => POSTHandler(...args).catch(errorReply);
