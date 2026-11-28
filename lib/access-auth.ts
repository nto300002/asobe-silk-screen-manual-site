import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { skillDb } from "@/lib/skill-db";
import { provisionParticipant } from "@/lib/account-records.mjs";
import { accountAccessStatus } from "@/lib/account-access.mjs";

export type SiteIdentity = { sub: string; email: string };
export type SkillRole = "provisional" | "participant" | "staff" | "admin";
export type SkillAccount = SiteIdentity & { role: SkillRole; active: boolean; userId: number | null };

export async function getSiteIdentity(): Promise<SiteIdentity | null> {
  const user = await getChatGPTUser();
  return user ? { sub: user.userId, email: user.email } : null;
}

export async function getSkillAccount(): Promise<SkillAccount | null> {
  const identity = await getSiteIdentity();
  if (!identity) return null;
  const db = skillDb();
  // Keep legacy progress records while requiring every former participant to be approved again.
  // approved_at makes this safe to repeat after a new participant is approved.
  await db.prepare(`UPDATE account_identities SET role = 'provisional'
    WHERE role = 'pending' OR (role = 'participant' AND approved_at IS NULL)`).run();
  await provisionParticipant(db, identity, new Date().toISOString());
  const bootstrapEmail = (env as unknown as { ADMIN_OWNER_EMAIL?: string })
    .ADMIN_OWNER_EMAIL?.trim().toLowerCase();
  if (bootstrapEmail && identity.email.toLowerCase() === bootstrapEmail) {
    await db.prepare(`UPDATE account_identities SET role = 'admin', active = 1
      WHERE access_sub = ? AND NOT EXISTS
      (SELECT 1 FROM account_identities WHERE role = 'admin')`)
      .bind(identity.sub).run();
  }
  const row = await db.prepare("SELECT role, active, user_id AS userId FROM account_identities WHERE access_sub = ?")
    .bind(identity.sub).first<{ role: SkillRole; active: number; userId: number | null }>();
  return { ...identity, role: row?.role ?? "provisional", active: row?.active === 1, userId: row?.userId ?? null };
}

export function accountDenied(account: SkillAccount | null): Response | null {
  const status = accountAccessStatus(account);
  if (status !== 200) return Response.json({ error: status === 401 ? "Google アカウントでログインしてください" : "このアカウントは利用できません" }, { status, headers: { "Cache-Control": "no-store" } });
  return null;
}

export function isStaff(account: SkillAccount): boolean {
  return account.active && (account.role === "staff" || account.role === "admin");
}
