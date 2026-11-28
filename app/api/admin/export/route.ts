import { env } from 'cloudflare:workers';
import { getSkillAccount } from '@/lib/access-auth';
import { skillDb } from '@/lib/skill-db';
import { auditStatement } from '@/lib/audit-log.mjs';
import { sha256, streamedZip } from '@/lib/export-zip';

export const dynamic = 'force-dynamic';
type Row = Record<string, unknown>;
const policy = {
  users: { all: 'id name name_key created_at deleted_at can_edit editor_email', export: 'id name name_key created_at deleted_at can_edit' },
  manual_documents: { all: 'id content version', export: 'id content version' },
  manual_videos: { all: 'id entry_id step_id title youtube_id purpose description filmed_at duration_seconds status version base_published_id preview_confirmed_at archived_at created_at updated_at created_by', export: 'id entry_id step_id title youtube_id purpose description filmed_at duration_seconds status version base_published_id preview_confirmed_at archived_at created_at updated_at' },
  manual_video_preview_checks: { all: 'video_id version platform actor_sub confirmed_at', export: 'video_id version platform confirmed_at' },
  progress: { all: 'user_id step_id item_index checked_at', export: 'user_id step_id item_index checked_at' },
  progress_archives: { all: 'merge_id user_id step_id item_index checked_at archived_at actor_sub', export: 'merge_id user_id step_id item_index checked_at archived_at' },
  app_sessions: { all: 'token_hash user_id email display_name last_activity_ms created_at_ms', export: '' },
  oauth_states: { all: 'state_hash browser_token_hash nonce code_verifier return_to expires_at_ms created_at_ms', export: '' },
  staff_identities: { all: 'google_sub user_id email created_at', export: '' },
  account_identities: { all: 'access_sub email role active user_id last_seen_at approved_at', export: '' },
  staff_enrollment_grants: { all: 'access_sub approved_by target_role confirmed_name expires_at', export: '' },
  passkeys: { all: 'credential_id access_sub public_key counter transports created_at', export: '' },
  passkey_challenges: { all: 'access_sub purpose challenge expires_at', export: '' },
  edit_grants: { all: 'access_sub session_nonce expires_at', export: '' },
  audit_logs: { all: 'id actor_sub occurred_at action target', export: '' },
} as const;
const tables = Object.keys(policy).sort();
const businessTables = Object.entries(policy).filter(([, item]) => item.export).map(([name]) => name);
function quote(name: string) { if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid identifier'); return `"${name}"`; }
function split(text: string) { return text ? text.split(' ') : []; }
function error(message: string, status = 503) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function listImages() {
  if (!env.BUCKET) throw new Error('画像保存先が利用できません');
  const images: Array<{ key: string; size: number; etag: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      if (!/^manual-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(object.key)) throw new Error(`未分類の画像キー: ${object.key}`);
      images.push({ key: object.key, size: object.size, etag: object.etag });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return images.sort((a, b) => a.key.localeCompare(b.key));
}
async function archive() {
  const before = await listImages();
  const db = skillDb();
  const statements: D1PreparedStatement[] = [db.prepare(`SELECT name, type, tbl_name AS tableName, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations', '__drizzle_migrations', '__appgarden_migrations') ORDER BY type, name`)];
  for (const table of tables) {
    statements.push(db.prepare(`PRAGMA table_xinfo(${quote(table)})`), db.prepare(`PRAGMA foreign_key_list(${quote(table)})`), db.prepare(`PRAGMA index_list(${quote(table)})`), db.prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}`));
  }
  for (const table of businessTables) {
    const columns = split(policy[table as keyof typeof policy].export);
    statements.push(db.prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)} ORDER BY rowid`));
  }
  const results = await db.batch(statements);
  const schema = results[0].results as Row[];
  const found = schema.filter(row => row.type === 'table').map(row => String(row.name)).sort();
  if (JSON.stringify(found) !== JSON.stringify(tables)) throw new Error(`未分類のテーブル: ${found.join(', ')}`);
  const tableInfo: Row[] = [];
  let position = 1;
  for (const table of tables) {
    const columns = results[position++].results as Row[];
    const foreignKeys = results[position++].results as Row[];
    const indexes = results[position++].results as Row[];
    const count = Number((results[position++].results as Row[])[0]?.count);
    const expected = split(policy[table as keyof typeof policy].all).sort();
    const actual = columns.filter(row => Number(row.hidden) === 0).map(row => String(row.name)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`未承認の列構造: ${table}`);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`件数が不正: ${table}`);
    tableInfo.push({ name: table, columns, foreignKeys, indexes, count, classification: businessTables.includes(table) ? 'business-data' : 'schema-and-count-only', omittedColumns: split(policy[table as keyof typeof policy].all).filter(name => !split(policy[table as keyof typeof policy].export).includes(name)) });
  }
  const encoder = new TextEncoder();
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  const definitions = schema.filter(row => typeof row.sql === 'string').sort((a,b) => (a.type === 'table' ? 0 : 1) - (b.type === 'table' ? 0 : 1));
  files.push({ name: 'schema/schema.sql', bytes: encoder.encode(definitions.map(row => `${String(row.sql).replace(/;\s*$/, '')};`).join('\n\n') + '\n') });
  files.push({ name: 'schema/tables.json', bytes: encoder.encode(JSON.stringify(tableInfo, null, 2) + '\n') });
  const exportedRows: Record<string, number> = {};
  for (const [index, table] of businessTables.entries()) {
    const rows = results[position + index].results as Row[];
    if (rows.length !== tableInfo.find(info => info.name === table)?.count) throw new Error(`不完全な取得: ${table}`);
    exportedRows[table] = rows.length;
    files.push({ name: `data/${table}.jsonl`, bytes: encoder.encode(rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')) });
  }
  const timestamp = new Date().toISOString();
  const filename = `asobe-print-manual-${timestamp.replace(/[:.]/g, '-')}.zip`;
  async function* entries() {
    const manifestFiles: Array<{ path: string; size: number; sha256: string }> = [];
    const images: Array<{ originalKey: string; archivePath: string; etag: string }> = [];
    for (const file of files) {
      manifestFiles.push({ path: file.name, size: file.bytes.length, sha256: await sha256(file.bytes) });
      yield file;
    }
    for (const [index, item] of before.entries()) {
      const object = await env.BUCKET!.get(item.key);
      if (!object || object.etag !== item.etag || object.size !== item.size) throw new Error(`画像が取得中に変更されました: ${item.key}`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      const extension = item.key.split('.').pop();
      const archivePath = `assets/${String(index + 1).padStart(6, '0')}.${extension}`;
      manifestFiles.push({ path: archivePath, size: bytes.length, sha256: await sha256(bytes) });
      images.push({ originalKey: item.key, archivePath, etag: item.etag });
      yield { name: archivePath, bytes };
    }
    if (JSON.stringify(before) !== JSON.stringify(await listImages())) throw new Error('画像一覧が取得中に変更されました。再試行してください');
    const manifest = { formatVersion: 1, exportId: crypto.randomUUID(), siteUrl: env.APP_ORIGIN?.trim() || 'https://asobe-silk-screen-skill-check.hherocl278.chatgpt.site', generatedAt: timestamp, policyVersion: 1, snapshotMethod: 'single D1 batch transaction; immutable R2 objects verified by ETag, size and two key listings', tables: tableInfo.map(info => ({ name: info.name, count: info.count, classification: info.classification, exportedRows: exportedRows[String(info.name)] ?? 0, omittedColumns: info.omittedColumns })), images, files: manifestFiles, complete: true };
    yield { name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2) + '\n') };
  }
  return new Response(streamedZip(entries()), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function GET() {
  const account = await getSkillAccount();
  if (!account) return error('サインインしてください', 401);
  if (!account.active || account.role !== 'admin') return error('管理者のみ利用できます', 403);
  try {
    await auditStatement(skillDb(), account.sub, 'export.started', 'business-data-schema-and-images').run();
    return await archive();
  } catch (cause) {
    console.error('Manual export failed', cause);
    return error(cause instanceof Error ? cause.message : 'エクスポートに失敗しました');
  }
}
