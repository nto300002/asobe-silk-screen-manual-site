export const IDLE_LIMIT_MS = 60 * 60 * 1000;

async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sessionExpiresAt(db, token, userId, now = Date.now()) {
  if (!token) return null;
  const row = await db.prepare("SELECT user_id, last_activity_ms FROM app_sessions WHERE token_hash = ?")
    .bind(await tokenHash(token)).first();
  if (row?.user_id !== userId || row.last_activity_ms <= now - IDLE_LIMIT_MS) return null;
  return row.last_activity_ms + IDLE_LIMIT_MS;
}

export async function startSession(db, userId, now = Date.now()) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await db.prepare("INSERT INTO app_sessions (token_hash, user_id, last_activity_ms, created_at_ms) VALUES (?, ?, ?, ?)")
    .bind(await tokenHash(token), userId, now, now).run();
  return token;
}

export async function touchSession(db, token, userId, now = Date.now()) {
  if (!token) return false;
  const result = await db.prepare(`UPDATE app_sessions SET last_activity_ms = ?
    WHERE token_hash = ? AND user_id = ? AND last_activity_ms > ?`)
    .bind(now, await tokenHash(token), userId, now - IDLE_LIMIT_MS).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function endSession(db, token) {
  if (!token) return;
  await db.prepare("DELETE FROM app_sessions WHERE token_hash = ?")
    .bind(await tokenHash(token)).run();
}
