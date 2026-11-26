import { errorReply } from "@/lib/skill-db";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { requireEditor, relyingParty, saveChallenge, consumeChallenge } from "@/lib/passkey-auth";
import { reply, skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { auditStatement } from "@/lib/audit-log.mjs";

type StoredPasskey = { credentialId: string; publicKey: string; counter: number; transports: string };

async function GETHandler() {
  const auth = await requireEditor();
  if (auth.response) return auth.response;
  const account = auth.account!;
  const { results } = await skillDb().prepare("SELECT credential_id AS credentialId, transports FROM passkeys WHERE access_sub = ?")
    .bind(account.sub).all<Pick<StoredPasskey, "credentialId" | "transports">>();
  if (!results.length) return reply({ error: "先にパスキーを登録してください" }, 409);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    userVerification: "required",
    allowCredentials: results.map(row => ({ id: row.credentialId, transports: JSON.parse(row.transports) })),
  });
  await saveChallenge(account.sub, "authenticate", options.challenge);
  return reply(options);
}

async function POSTHandler(request: Request) {
  const auth = await requireEditor();
  if (auth.response) return auth.response;
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const account = auth.account!;
  const challenge = await consumeChallenge(account.sub, "authenticate");
  if (!challenge) return reply({ error: "認証の有効時間が切れました" }, 400);
  try {
    const response = await request.json() as Parameters<typeof verifyAuthenticationResponse>[0]["response"];
    const stored = await skillDb().prepare(`SELECT credential_id AS credentialId, public_key AS publicKey,
      counter, transports FROM passkeys WHERE credential_id = ? AND access_sub = ?`)
      .bind(response.id, account.sub).first<StoredPasskey>();
    if (!stored) return reply({ error: "登録済みのパスキーではありません" }, 403);
    const { rpID, origin } = relyingParty();
    const result = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin,
      expectedRPID: rpID, requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: JSON.parse(stored.transports),
      },
    });
    if (!result.verified) return reply({ error: "パスキーを確認できません" }, 403);
    const db = skillDb();
    const grantToken = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE passkeys SET counter = ? WHERE credential_id = ? AND access_sub = ?")
        .bind(result.authenticationInfo.newCounter, stored.credentialId, account.sub),
      db.prepare(`INSERT INTO edit_grants (access_sub, session_nonce, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(access_sub) DO UPDATE SET session_nonce = excluded.session_nonce,
          expires_at = excluded.expires_at`)
        .bind(account.sub, grantToken, Date.now() + 15 * 60_000),
      auditStatement(db, account.sub, 'skill.passkey.unlock', 'manual-edit'),
    ]);
    const output = reply({ ok: true, expiresInSeconds: 900 });
    output.headers.set("Set-Cookie", `asobe_skill_edit_grant=${grantToken}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict`);
    return output;
  } catch {
    return reply({ error: "パスキー認証に失敗しました" }, 403);
  }
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const POST = (...args: Parameters<typeof POSTHandler>) => POSTHandler(...args).catch(errorReply);
