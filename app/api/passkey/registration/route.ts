import { errorReply } from "@/lib/skill-db";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { relyingParty, saveChallenge, consumeChallenge } from "@/lib/passkey-auth";
import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { canEditManual } from "@/lib/admin-auth";
import { reply, skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { auditStatement } from "@/lib/audit-log.mjs";

async function registrationAccount() {
  const account = await getSkillAccount();
  if (!account) return { response: reply({ error: "ログインしてください" }, 401) };
  if (!account.active) return { response: reply({ error: "このアカウントは利用できません" }, 403) };
  const db = skillDb();
  const existing = await db.prepare("SELECT credential_id FROM passkeys WHERE access_sub = ? LIMIT 1")
    .bind(account.sub).first();
  if (isStaff(account)) {
    // The first administrator can bootstrap a key. Additional keys require an existing key.
    if (existing && !await canEditManual(undefined)) return { response: reply({ error: "追加登録の前に登録済みパスキーで本人確認してください" }, 403) };
    if (!existing && account.role !== "admin") return { response: reply({ error: "職員の初回登録許可が必要です" }, 403) };
    return { account, enrollment: null };
  }
  const enrollment = await db.prepare(`SELECT target_role AS targetRole, confirmed_name AS confirmedName,
    expires_at AS expiresAt FROM staff_enrollment_grants WHERE access_sub = ?`)
    .bind(account.sub).first<{ targetRole: string; confirmedName: string; expiresAt: number }>();
  if (!enrollment || enrollment.expiresAt <= Date.now()) return { response: reply({ error: "管理者の職員登録許可が必要です" }, 403) };
  return { account, enrollment };
}

async function GETHandler() {
  const auth = await registrationAccount();
  if (auth.response) return auth.response;
  const account = auth.account!;
  const { rpID } = relyingParty();
  const existing = await skillDb().prepare("SELECT credential_id AS id, transports FROM passkeys WHERE access_sub = ?")
    .bind(account.sub).all<{ id: string; transports: string }>();
  const options = await generateRegistrationOptions({
    rpName: "asoBe シルクスクリーン",
    rpID,
    userName: account.email,
    userID: new TextEncoder().encode(account.sub),
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: existing.results.map(row => ({ id: row.id, transports: JSON.parse(row.transports) })),
  });
  await saveChallenge(account.sub, "register", options.challenge);
  return reply(options);
}

async function POSTHandler(request: Request) {
  const auth = await registrationAccount();
  if (auth.response) return auth.response;
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const account = auth.account!;
  const challenge = await consumeChallenge(account.sub, "register");
  if (!challenge) return reply({ error: "登録の有効時間が切れました" }, 400);
  const { rpID, origin } = relyingParty();
  try {
    const response = await request.json() as Parameters<typeof verifyRegistrationResponse>[0]["response"];
    const result = await verifyRegistrationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin,
      expectedRPID: rpID, requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo) return reply({ error: "パスキーを確認できません" }, 400);
    const credential = result.registrationInfo.credential;
    const db = skillDb();
    const statements = [db.prepare(`INSERT INTO passkeys
      (credential_id, access_sub, public_key, counter, transports, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(credential.id, account.sub, Buffer.from(credential.publicKey).toString("base64url"),
        credential.counter, JSON.stringify(credential.transports ?? []), new Date().toISOString()),
      auditStatement(db, account.sub, 'skill.passkey.register', `credential:${credential.id}`)];
    if (auth.enrollment) {
      statements.push(
        db.prepare(`UPDATE users SET name = ? WHERE id = ? AND name_key = ?`)
          .bind(auth.enrollment.confirmedName, account.userId, `chatgpt:${account.sub}`),
        db.prepare(`UPDATE account_identities SET role = ?, approved_at = ?
          WHERE access_sub = ? AND active = 1 AND role IN ('provisional', 'participant')`)
          .bind(auth.enrollment.targetRole, new Date().toISOString(), account.sub),
        db.prepare("DELETE FROM staff_enrollment_grants WHERE access_sub = ?").bind(account.sub),
        auditStatement(db, account.sub, 'skill.staff.enrollment.complete',
          `account:${account.sub}:${auth.enrollment.targetRole}`),
      );
    }
    await db.batch(statements);
    return reply({ ok: true });
  } catch {
    return reply({ error: "パスキーの登録に失敗しました" }, 400);
  }
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const POST = (...args: Parameters<typeof POSTHandler>) => POSTHandler(...args).catch(errorReply);
