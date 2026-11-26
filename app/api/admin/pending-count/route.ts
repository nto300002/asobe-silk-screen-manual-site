import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { errorReply, reply, skillDb } from "@/lib/skill-db";

async function GETHandler() {
  const account = await getSkillAccount();
  if (!account) return reply({ error: "ログインしてください" }, 401);
  if (!isStaff(account)) return reply({ error: "職員権限がありません" }, 403);
  const row = await skillDb().prepare(`SELECT COUNT(*) AS count FROM account_identities
    WHERE role = 'provisional' AND active = 1`).first<{ count: number }>();
  return reply({ count: row?.count ?? 0, canManage: account.role === "admin" });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
