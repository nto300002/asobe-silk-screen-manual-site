import { errorReply, parseBody, reply, skillDb } from "@/lib/skill-db";
import { getAdminStatus } from "@/lib/admin-auth";
import { getSkillAccount } from "@/lib/access-auth";
import { auditStatement } from "@/lib/audit-log.mjs";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { softDeleteUser } from "@/lib/user-records.mjs";

type UserRow = { id: number; name: string };

function publicUser(row: UserRow) { return { id: row.id, name: row.name }; }

async function GETHandler() {
  const status = await getAdminStatus();
  if (!status.admin) return reply({ error: "管理者のみ利用できます" }, status.authenticated ? 403 : 401);
  try {
    const { results } = await skillDb().prepare("SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY created_at, id").all<UserRow>();
    return reply({ users: results.map(publicUser) });
  } catch (error) { return errorReply(error); }
}

async function POSTHandler(request: Request) {
  const status = await getAdminStatus();
  if (!status.editor) return reply({ error: "職員のみ利用できます" }, status.authenticated ? 403 : 401);
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const input = await parseBody(request);
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 40) return reply({ error: "名前は1〜40文字で入力してください" }, 400);
  const key = name.toLocaleLowerCase("ja-JP");
  try {
    const db = skillDb();
    const pending = await db.prepare(`SELECT 1 FROM account_identities a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.role = 'provisional' AND (lower(a.email) = lower(?) OR u.name_key = ?) LIMIT 1`)
      .bind(name, key).first();
    if (pending) return reply({ error: "承認待ちアカウントの利用者記録は選択できません" }, 403);
    const existing = await db.prepare("SELECT id, name FROM users WHERE name_key = ?").bind(key).first<UserRow>();
    if (existing) return reply({ user: publicUser(existing), existed: true });
    await db.prepare("INSERT OR IGNORE INTO users (name, name_key, created_at) VALUES (?, ?, ?)").bind(name, key, new Date().toISOString()).run();
    const user = await db.prepare("SELECT id, name FROM users WHERE name_key = ?").bind(key).first<UserRow>();
    if (!user) throw new Error("利用者を読み込めません");
    const account = await getSkillAccount();
    await auditStatement(db, account!.sub, 'skill.user.create', `user:${user.id}`).run();
    return reply({ user: publicUser(user) }, 201);
  } catch (error) { return errorReply(error); }
}

async function DELETEHandler(request: Request) {
  const status = await getAdminStatus();
  if (!status.admin) return reply({ error: "管理者のみ削除できます" }, status.authenticated ? 403 : 401);
  const rejected = rejectWriteRequest(request, "query");
  if (rejected) return rejected;
  const userId = Number(new URL(request.url).searchParams.get("userId"));
  if (!Number.isInteger(userId) || userId < 1) return reply({ error: "利用者記録を指定してください" }, 400);
  const db = skillDb();
  const actor = await getSkillAccount();
  const result = await softDeleteUser(db, userId);
  if (result.status === "not-found") return reply({ error: "利用者記録が見つかりません" }, 404);
  if (result.status === "linked") return reply({ error: "アカウントに紐付いている利用者記録は削除できません" }, 409);
  if (result.status !== "deleted") return reply({ error: "利用者記録の状態が変わりました。画面を更新してください" }, 409);
  await auditStatement(db, actor!.sub, 'skill.user.delete', `user:${userId}`).run();
  return reply({ ok: true });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const POST = (...args: Parameters<typeof POSTHandler>) => POSTHandler(...args).catch(errorReply);
export const DELETE = (...args: Parameters<typeof DELETEHandler>) => DELETEHandler(...args).catch(errorReply);
