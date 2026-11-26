import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { auditStatement } from '../lib/audit-log.mjs';

test('progress and manual changes can be attributed to the ChatGPT account', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_sub TEXT NOT NULL, occurred_at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL)');
  const db = { prepare(sql) { return { bind(...values) { return { run: async () => sqlite.prepare(sql).run(...values) }; } }; } };
  await auditStatement(db, 'google-sub-2', 'skill.progress.check', 'user:4:step:one:0').run();
  assert.deepEqual({ ...sqlite.prepare('SELECT actor_sub AS actorSub, action, target FROM audit_logs').get() },
    { actorSub: 'google-sub-2', action: 'skill.progress.check', target: 'user:4:step:one:0' });
});
