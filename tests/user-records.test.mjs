import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { availableProgressUserSql, softDeleteUser, visibleUserListSql } from '../lib/user-records.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE account_identities (access_sub TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL,
    active INTEGER NOT NULL, user_id INTEGER UNIQUE, approved_at TEXT);
    CREATE TABLE progress (user_id INTEGER NOT NULL, step_id TEXT NOT NULL, item_index INTEGER NOT NULL, checked_at TEXT NOT NULL);`);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...values) { return {
    first: async () => statement.get(...values) ?? null,
    run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
  }; } }; } };
  return { sqlite, db };
}

test('the staff picker omits pending accounts even when their user key looks like a normal name', () => {
  const { sqlite } = fixture();
  sqlite.exec(`INSERT INTO users VALUES (1, '承認待ち', 'legacy', '2026-10-01', NULL),
    (2, '利用者', 'participant', '2026-10-01', NULL),
    (3, 'ChatGPT登録', 'chatgpt:approved', '2026-10-01', NULL),
    (4, '未紐付け', 'free', '2026-10-01', NULL);
    INSERT INTO account_identities VALUES ('pending', 'pending@example.test', 'provisional', 1, 1, NULL),
    ('approved', 'approved@example.test', 'participant', 1, 3, '2026-10-22');`);
  assert.deepEqual(sqlite.prepare(visibleUserListSql).all().map(row => row.id), [2, 3, 4]);
  assert.equal(sqlite.prepare(availableProgressUserSql).get(1), undefined);
  assert.equal(sqlite.prepare(availableProgressUserSql).get(3).id, 3);
});

test('admin deletion hides an unlinked record but preserves its progress', async () => {
  const { sqlite, db } = fixture();
  sqlite.exec(`INSERT INTO users VALUES (1, '削除対象', 'target', '2026-10-01', NULL);
    INSERT INTO progress VALUES (1, 'step', 0, '2026-10-01');`);
  assert.equal((await softDeleteUser(db, 1)).status, 'deleted');
  assert.equal(sqlite.prepare(visibleUserListSql).all().length, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM progress WHERE user_id = 1').get().count, 1);
  assert.equal(sqlite.prepare(availableProgressUserSql).get(1), undefined);
  assert.equal((await softDeleteUser(db, 1)).status, 'not-found');
});

test('a record linked to an account cannot be deleted', async () => {
  const { sqlite, db } = fixture();
  sqlite.exec(`INSERT INTO users VALUES (1, '利用者', 'linked', '2026-10-01', NULL);
    INSERT INTO account_identities VALUES ('person', 'person@example.test', 'participant', 1, 1, '2026-10-22');`);
  assert.equal((await softDeleteUser(db, 1)).status, 'linked');
  assert.equal(sqlite.prepare('SELECT deleted_at FROM users WHERE id = 1').get().deleted_at, null);
});
