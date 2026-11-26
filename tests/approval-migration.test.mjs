import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { accountAccessStatus } from '../lib/account-access.mjs';

test('migration keeps existing accounts and forbids the retired pending role', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE account_identities (
    access_sub TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'pending',
    active INTEGER NOT NULL, user_id INTEGER, last_seen_at TEXT NOT NULL);
    INSERT INTO account_identities VALUES ('old-user','old@example.test','participant',1,7,'2026-10-20');`);
  const sql = readFileSync(new URL('../drizzle/0006_fearless_fallen_one.sql', import.meta.url), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean)) db.exec(statement);
  db.exec(`UPDATE account_identities SET role = 'provisional'
    WHERE role = 'pending' OR (role = 'participant' AND approved_at IS NULL)`);
  assert.deepEqual({ ...db.prepare('SELECT role, user_id AS userId FROM account_identities').get() },
    { role: 'provisional', userId: 7 });
  assert.equal(accountAccessStatus({ role: 'provisional', active: true }), 403);
  assert.throws(() => db.exec(`UPDATE account_identities SET role = 'pending' WHERE access_sub = 'old-user'`));
  db.exec(`UPDATE account_identities SET role = 'participant', approved_at = '2026-10-22' WHERE access_sub = 'old-user'`);
  db.exec(`UPDATE account_identities SET role = 'provisional'
    WHERE role = 'pending' OR (role = 'participant' AND approved_at IS NULL)`);
  assert.equal(db.prepare('SELECT role FROM account_identities').get().role, 'participant');
});

test('manual sample photos are no longer public assets', () => {
  for (const name of ['step_02.JPG', 'data-receive-example.jpg', 'data-levels-example.jpg']) {
    assert.equal(existsSync(new URL(`../public/${name}`, import.meta.url)), false);
  }
});
