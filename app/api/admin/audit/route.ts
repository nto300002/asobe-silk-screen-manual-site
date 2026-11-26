import { errorReply } from "@/lib/skill-db";
import { getSkillAccount } from '@/lib/access-auth';
import { reply, skillDb } from '@/lib/skill-db';

async function GETHandler() {
  const account = await getSkillAccount();
  if (!account) return reply({ error: 'ログインしてください' }, 401);
  if (!account.active || account.role !== 'admin') return reply({ error: '管理者のみ利用できます' }, 403);
  const rows = await skillDb().prepare(`SELECT id, actor_sub AS actorSub, occurred_at AS occurredAt,
    action, target FROM audit_logs ORDER BY id DESC LIMIT 200`).all();
  return reply({ entries: rows.results });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
