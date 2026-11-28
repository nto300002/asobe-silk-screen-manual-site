import { env } from "cloudflare:workers";
import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { reply, skillDb } from "@/lib/skill-db";

export async function requireEditor() {
  const account = await getSkillAccount();
  if (!account) return { response: reply({ error: "Google アカウントでログインしてください" }, 401) };
  if (!account.active || !isStaff(account)) return { response: reply({ error: "職員権限がありません" }, 403) };
  return { account };
}

export function relyingParty() {
  const settings = env as unknown as { WEBAUTHN_RP_ID?: string; WEBAUTHN_ORIGIN?: string; APP_ORIGIN?: string };
  let rpID = settings.WEBAUTHN_RP_ID?.trim();
  let origin = settings.WEBAUTHN_ORIGIN?.trim();
  if ((!rpID || !origin) && settings.APP_ORIGIN?.trim()) {
    try {
      const parsed = new URL(settings.APP_ORIGIN.trim());
      if (parsed.protocol === "https:") {
        rpID ||= parsed.hostname;
        origin ||= parsed.origin;
      }
    } catch { /* fallback rejected below */ }
  }
  if (!rpID || !origin || origin !== `https://${rpID}`) throw new Error("WebAuthn origin is not configured");
  return { rpID, origin };
}

export async function saveChallenge(sub: string, purpose: "register" | "authenticate", challenge: string) {
  await skillDb().prepare(`INSERT INTO passkey_challenges (access_sub, purpose, challenge, expires_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(access_sub, purpose) DO UPDATE SET
    challenge = excluded.challenge, expires_at = excluded.expires_at`)
    .bind(sub, purpose, challenge, Date.now() + 5 * 60_000).run();
}

export async function consumeChallenge(sub: string, purpose: "register" | "authenticate") {
  const row = await skillDb().prepare(`DELETE FROM passkey_challenges
    WHERE access_sub = ? AND purpose = ? AND expires_at > ? RETURNING challenge`)
    .bind(sub, purpose, Date.now()).first<{ challenge: string }>();
  return row?.challenge ?? null;
}
