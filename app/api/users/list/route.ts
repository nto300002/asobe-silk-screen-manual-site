import { errorReply, reply, skillDb } from "@/lib/skill-db";
import { accountDenied, getSkillAccount, isStaff } from "@/lib/access-auth";
import { visibleUserListSql } from "@/lib/user-records.mjs";

async function GETHandler() {
  const account = await getSkillAccount();
  const denied = accountDenied(account);
  if (denied) return denied;
  try {
    const { results } = isStaff(account!)
      ? await skillDb().prepare(visibleUserListSql).all<{ id: number; name: string }>()
      : await skillDb().prepare("SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL").bind(account!.userId).all<{ id: number; name: string }>();
    return reply({ users: results });
  } catch (error) { return errorReply(error); }
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
