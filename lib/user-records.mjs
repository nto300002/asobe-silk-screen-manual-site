export const visibleUserListSql = `SELECT u.id, u.name FROM users u
  WHERE u.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM account_identities pending
      WHERE pending.user_id = u.id AND pending.role = 'provisional')
    AND (u.name_key NOT LIKE 'chatgpt:%' OR EXISTS (
      SELECT 1 FROM account_identities a WHERE a.user_id = u.id
        AND a.approved_at IS NOT NULL AND a.role IN ('participant', 'staff', 'admin')))
  ORDER BY u.created_at, u.id`;

export const availableProgressUserSql = `SELECT id FROM users u WHERE id = ? AND deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM account_identities a WHERE a.user_id = u.id AND a.role = 'provisional')`;

export async function softDeleteUser(db, userId, deletedAt = new Date().toISOString()) {
  const user = await db.prepare(`SELECT id, name,
    (SELECT 1 FROM account_identities WHERE user_id = users.id) AS linked
    FROM users WHERE id = ? AND deleted_at IS NULL`).bind(userId).first();
  if (!user) return { status: 'not-found' };
  if (user.linked) return { status: 'linked' };
  const result = await db.prepare(`UPDATE users SET deleted_at = ?, name_key = ?
    WHERE id = ? AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM account_identities WHERE user_id = users.id)`)
    .bind(deletedAt, `deleted:${userId}:${crypto.randomUUID()}`, userId).run();
  return result.meta.changes ? { status: 'deleted', name: user.name } : { status: 'changed' };
}
