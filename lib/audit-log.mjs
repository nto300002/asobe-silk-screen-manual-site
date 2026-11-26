export function auditStatement(db, actorSub, action, target) {
  return db.prepare('INSERT INTO audit_logs (actor_sub, occurred_at, action, target) VALUES (?, ?, ?, ?)')
    .bind(actorSub, new Date().toISOString(), action, target);
}
