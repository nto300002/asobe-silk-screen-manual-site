import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { provisionParticipant, linkExistingParticipant } from '../lib/account-records.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE account_identities (access_sub TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL, user_id INTEGER UNIQUE, last_seen_at TEXT NOT NULL);
    CREATE TABLE progress (user_id INTEGER NOT NULL, step_id TEXT NOT NULL, item_index INTEGER NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(user_id, step_id, item_index));
    CREATE TABLE progress_archives (merge_id TEXT NOT NULL, user_id INTEGER NOT NULL, step_id TEXT NOT NULL, item_index INTEGER NOT NULL, checked_at TEXT NOT NULL, archived_at TEXT NOT NULL, actor_sub TEXT NOT NULL, PRIMARY KEY(merge_id, user_id, step_id, item_index));`);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = values => ({
        run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
        first: async () => statement.get(...values) ?? null,
        all: async () => ({ results: statement.all(...values) }),
      });
      return { ...bound([]), bind: (...values) => bound(values) };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

test('a first ChatGPT sign-in creates one personal record and repeated sign-ins reuse it', async () => {
  const { sqlite, db } = fixture();
  const identity = { sub: 'site-user-1', email: 'person@example.com' };
  const first = await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  const second = await provisionParticipant(db, identity, '2026-10-20T00:01:00Z');
  assert.equal(first.role, 'provisional');
  assert.equal(first.active, true);
  assert.equal(first.userId, second.userId);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
});

test('choosing existing progress keeps its checks and preserves the ChatGPT source separately', async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)').run('既存の利用者', 'existing', '2026-10-01');
  const oldId = Number(sqlite.prepare('SELECT id FROM users WHERE name_key = ?').get('existing').id);
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(oldId, 'old-step', 0, '2026-10-01');
  const identity = { sub: 'site-user-2', email: 'other@example.com' };
  const fresh = await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(fresh.userId, 'new-step', 0, '2026-10-20');
  await linkExistingParticipant(db, identity.sub, oldId, 'existing');
  const linked = sqlite.prepare('SELECT user_id AS userId FROM account_identities WHERE access_sub = ?').get(identity.sub);
  assert.equal(linked.userId, oldId);
  assert.deepEqual(sqlite.prepare('SELECT step_id AS stepId FROM progress WHERE user_id = ? ORDER BY step_id').all(oldId).map(row => row.stepId), ['old-step']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM progress WHERE user_id = ?').get(fresh.userId).count, 1);
  await provisionParticipant(db, identity, '2026-10-20T00:02:00Z');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
});

test('choosing ChatGPT progress replaces the visible checks while preserving the old record', async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)').run('既存の利用者', 'existing', '2026-10-01');
  const oldId = Number(sqlite.prepare('SELECT id FROM users WHERE name_key = ?').get('existing').id);
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(oldId, 'old-step', 0, '2026-10-01');
  const identity = { sub: 'site-user-3', email: 'new@example.com' };
  const fresh = await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(fresh.userId, 'new-step', 0, '2026-10-20');
  await linkExistingParticipant(db, identity.sub, oldId, 'chatgpt');
  assert.deepEqual(sqlite.prepare('SELECT step_id AS stepId FROM progress WHERE user_id = ?').all(oldId).map(row => row.stepId), ['new-step']);
  assert.deepEqual(sqlite.prepare('SELECT step_id AS stepId FROM progress WHERE user_id = ?').all(fresh.userId).map(row => row.stepId), ['new-step']);
  assert.deepEqual(sqlite.prepare('SELECT step_id AS stepId FROM progress_archives WHERE user_id = ?').all(oldId).map(row => row.stepId), ['old-step']);
  assert.equal(sqlite.prepare('SELECT user_id AS userId FROM account_identities WHERE access_sub = ?').get(identity.sub).userId, oldId);
});

test('linking distinct records requires an explicit progress choice', async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)').run('既存の利用者', 'existing', '2026-10-01');
  const oldId = Number(sqlite.prepare('SELECT id FROM users WHERE name_key = ?').get('existing').id);
  const identity = { sub: 'site-user-4', email: 'new@example.com' };
  const fresh = await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  await assert.rejects(linkExistingParticipant(db, identity.sub, oldId), /PROGRESS_CHOICE_REQUIRED/);
  assert.equal(sqlite.prepare('SELECT user_id AS userId FROM account_identities WHERE access_sub = ?').get(identity.sub).userId, fresh.userId);
});

test('a failed approval rolls back the progress switch and archive together', async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)').run('既存の利用者', 'existing', '2026-10-01');
  const oldId = Number(sqlite.prepare('SELECT id FROM users WHERE name_key = ?').get('existing').id);
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(oldId, 'old-step', 0, '2026-10-01');
  const identity = { sub: 'site-user-5', email: 'new@example.com' };
  const fresh = await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  sqlite.prepare('INSERT INTO progress VALUES (?, ?, ?, ?)').run(fresh.userId, 'new-step', 0, '2026-10-20');
  await assert.rejects(linkExistingParticipant(db, identity.sub, oldId, 'chatgpt', identity.sub,
    [db.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)').bind('重複', 'existing', '2026-10-20')]));
  assert.deepEqual(sqlite.prepare('SELECT step_id AS stepId FROM progress WHERE user_id = ?').all(oldId).map(row => row.stepId), ['old-step']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM progress_archives').get().count, 0);
  assert.equal(sqlite.prepare('SELECT user_id AS userId FROM account_identities WHERE access_sub = ?').get(identity.sub).userId, fresh.userId);
});

test('a stopped participant stays stopped on another sign-in', async () => {
  const { sqlite, db } = fixture();
  const identity = { sub: 'stopped-user', email: 'stopped@example.test' };
  await provisionParticipant(db, identity, '2026-10-20T00:00:00Z');
  sqlite.prepare('UPDATE account_identities SET active = 0 WHERE access_sub = ?').run(identity.sub);
  const account = await provisionParticipant(db, identity, '2026-10-20T00:01:00Z');
  assert.equal(account.active, false);
});
