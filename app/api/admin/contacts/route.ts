import { getSkillAccount } from "@/lib/access-auth";
import { reply, skillDb, errorReply } from "@/lib/skill-db";

async function GETHandler() {
  const account = await getSkillAccount();
  if (!account) return reply({ error: "ログインしてください" }, 401);
  if (!account.active) return reply({ error: "このアカウントは利用できません" }, 403);
  const { results } = await skillDb().prepare(`SELECT a.email, COALESCE(NULLIF(u.name, ''), a.email) AS name
    FROM account_identities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.role = 'admin' AND a.active = 1 ORDER BY name, a.email`).all<{ email: string; name: string }>();
  return reply({ admins: results });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
