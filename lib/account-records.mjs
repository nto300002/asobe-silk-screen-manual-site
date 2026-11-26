export async function provisionParticipant(db, identity, now) {
  const existing = await db.prepare('SELECT role, active, user_id AS userId FROM account_identities WHERE access_sub = ?')
    .bind(identity.sub).first();
  if (existing?.userId) {
    await db.prepare(`UPDATE account_identities SET email = ?, last_seen_at = ?
      WHERE access_sub = ?`)
      .bind(identity.email, now, identity.sub).run();
    return { role: existing.role, active: existing.active === 1, userId: existing.userId };
  }
  const nameKey = `chatgpt:${identity.sub}`;
  await db.prepare('INSERT OR IGNORE INTO users (name, name_key, created_at) VALUES (?, ?, ?)')
    .bind(identity.email, nameKey, now).run();
  const user = await db.prepare('SELECT id FROM users WHERE name_key = ?').bind(nameKey).first();
  if (!user) throw new Error('Could not create participant record');

  await db.prepare(`INSERT OR IGNORE INTO account_identities
    (access_sub, email, role, active, user_id, last_seen_at)
    VALUES (?, ?, 'provisional', 1, ?, ?)`)
    .bind(identity.sub, identity.email, user.id, now).run();
  await db.prepare(`UPDATE account_identities SET email = ?, last_seen_at = ?,
    user_id = COALESCE(user_id, ?)
    WHERE access_sub = ?`)
    .bind(identity.email, now, user.id, identity.sub).run();
  const row = await db.prepare('SELECT role, active, user_id AS userId FROM account_identities WHERE access_sub = ?')
    .bind(identity.sub).first();
  if (!row) throw new Error('Could not read participant account');
  return { role: row.role, active: row.active === 1, userId: row.userId };
}

export async function linkExistingParticipant(db, accessSub, targetUserId, progressChoice, actorSub = accessSub, extraStatements = []) {
  const linked = await db.prepare('SELECT access_sub FROM account_identities WHERE user_id = ? AND access_sub <> ?')
    .bind(targetUserId, accessSub).first();
  if (linked) throw new Error('PARTICIPANT_ALREADY_LINKED');
  const source = await db.prepare('SELECT user_id AS userId FROM account_identities WHERE access_sub = ?')
    .bind(accessSub).first();
  if (!source) throw new Error('ACCOUNT_NOT_FOUND');
  const statements = [];
  if (source.userId !== targetUserId && progressChoice !== 'existing' && progressChoice !== 'chatgpt') throw new Error('PROGRESS_CHOICE_REQUIRED');
  if (source.userId !== targetUserId && progressChoice === 'chatgpt') statements.push(
    db.prepare(`INSERT INTO progress_archives (merge_id, user_id, step_id, item_index, checked_at, archived_at, actor_sub)
      SELECT ?, user_id, step_id, item_index, checked_at, ?, ? FROM progress WHERE user_id = ?`)
      .bind(crypto.randomUUID(), new Date().toISOString(), actorSub, targetUserId),
    db.prepare('DELETE FROM progress WHERE user_id = ?').bind(targetUserId),
    db.prepare(`INSERT INTO progress (user_id, step_id, item_index, checked_at)
      SELECT ?, step_id, item_index, checked_at FROM progress WHERE user_id = ?`)
      .bind(targetUserId, source.userId),
  );
  if (source.userId !== targetUserId) statements.push(
    db.prepare('UPDATE account_identities SET user_id = ? WHERE access_sub = ?')
      .bind(targetUserId, accessSub),
  );
  if (statements.length || extraStatements.length) await db.batch([...statements, ...extraStatements]);
}
