import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { skillDb } from "@/lib/skill-db";
import { cookies } from "next/headers";

export async function getAdminStatus(): Promise<{ authenticated: boolean; admin: boolean; editor: boolean; userId: number | null }> {
  const account = await getSkillAccount();
  return {
    authenticated: !!account,
    admin: !!account?.active && account.role === "admin",
    editor: !!account?.active && isStaff(account),
    userId: account?.userId ?? null,
  };
}

export async function canEditManual(_selectedUserId: unknown, status?: Awaited<ReturnType<typeof getAdminStatus>>): Promise<boolean> {
  const currentStatus = status ?? await getAdminStatus();
  if (!currentStatus.editor) return false;
  const account = await getSkillAccount();
  if (!account?.active || !isStaff(account)) return false;
  const grantToken = (await cookies()).get("asobe_skill_edit_grant")?.value;
  if (!grantToken) return false;
  const grant = await skillDb().prepare("SELECT expires_at AS expiresAt FROM edit_grants WHERE access_sub = ? AND session_nonce = ?")
    .bind(account.sub, grantToken).first<{ expiresAt: number }>();
  return !!grant && grant.expiresAt > Date.now();
}
