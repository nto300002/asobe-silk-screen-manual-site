import { errorReply } from "@/lib/skill-db";
import { requireEditor } from "@/lib/passkey-auth";
import { reply, skillDb } from "@/lib/skill-db";
import { cookies } from "next/headers";

async function GETHandler() {
  const auth = await requireEditor();
  if (auth.response) return auth.response;
  const account = auth.account!;
  const db = skillDb();
  const credential = await db.prepare("SELECT credential_id FROM passkeys WHERE access_sub = ? LIMIT 1")
    .bind(account.sub).first();
  const grantToken = (await cookies()).get("asobe_skill_edit_grant")?.value;
  const grant = grantToken ? await db.prepare("SELECT expires_at AS expiresAt FROM edit_grants WHERE access_sub = ? AND session_nonce = ?")
    .bind(account.sub, grantToken).first<{ expiresAt: number }>() : null;
  const editingUnlocked = !!grant && grant.expiresAt > Date.now();
  return reply({ registered: !!credential, editingUnlocked, expiresAt: editingUnlocked ? grant.expiresAt : null });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
