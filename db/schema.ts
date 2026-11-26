import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  lastActivityMs: integer("last_activity_ms").notNull(),
  createdAtMs: integer("created_at_ms").notNull(),
}, table => [index("app_sessions_user_id_idx").on(table.userId)]);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
  editorEmail: text("editor_email"),
});

export const manualDocuments = sqliteTable("manual_documents", {
  id: integer("id").primaryKey(),
  content: text("content").notNull(),
  version: integer("version").notNull(),
});

export const manualVideos = sqliteTable("manual_videos", {
  id: text("id").primaryKey(), entryId: text("entry_id").notNull(), stepId: text("step_id"),
  title: text("title").notNull(), youtubeId: text("youtube_id").notNull(),
  purpose: text("purpose"), description: text("description"), filmedAt: text("filmed_at"),
  durationSeconds: integer("duration_seconds"), status: text("status").notNull(),
  version: integer("version").notNull().default(1), basePublishedId: text("base_published_id"),
  previewConfirmedAt: text("preview_confirmed_at"), archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), createdBy: text("created_by").notNull(),
}, table => [
  index("manual_videos_status_updated").on(table.status, table.updatedAt),
  uniqueIndex("manual_videos_one_draft").on(table.entryId).where(sql`status = 'draft'`),
  uniqueIndex("manual_videos_one_published").on(table.entryId).where(sql`status = 'published'`),
  uniqueIndex("manual_videos_one_step").on(table.stepId).where(sql`status = 'published' AND step_id IS NOT NULL`),
  uniqueIndex("manual_videos_one_step_draft").on(table.stepId).where(sql`status = 'draft' AND step_id IS NOT NULL`),
]);

export const manualVideoPreviewChecks = sqliteTable("manual_video_preview_checks", {
  videoId: text("video_id").notNull().references(() => manualVideos.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), platform: text("platform").notNull(),
  actorSub: text("actor_sub").notNull(), confirmedAt: text("confirmed_at").notNull(),
}, table => [primaryKey({ columns: [table.videoId, table.version, table.platform] })]);

export const progress = sqliteTable("progress", {
  userId: integer("user_id").notNull().references(() => users.id),
  stepId: text("step_id").notNull(),
  itemIndex: integer("item_index").notNull(),
  checkedAt: text("checked_at").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.stepId, table.itemIndex] })]);

export const progressArchives = sqliteTable("progress_archives", {
  mergeId: text("merge_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  stepId: text("step_id").notNull(),
  itemIndex: integer("item_index").notNull(),
  checkedAt: text("checked_at").notNull(),
  archivedAt: text("archived_at").notNull(),
  actorSub: text("actor_sub").notNull(),
}, table => [primaryKey({ columns: [table.mergeId, table.userId, table.stepId, table.itemIndex] })]);

export const accountIdentities = sqliteTable("account_identities", {
  accessSub: text("access_sub").primaryKey(),
  email: text("email").notNull(),
  // Legacy database default is guarded by a trigger; application inserts always set a role.
  role: text("role").notNull().default("pending"),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  userId: integer("user_id").references(() => users.id),
  lastSeenAt: text("last_seen_at").notNull(),
  approvedAt: text("approved_at"),
}, table => [uniqueIndex("account_identities_user_id_unique").on(table.userId)]);

export const staffEnrollmentGrants = sqliteTable("staff_enrollment_grants", {
  accessSub: text("access_sub").primaryKey().references(() => accountIdentities.accessSub),
  approvedBy: text("approved_by").notNull(),
  targetRole: text("target_role").notNull(),
  confirmedName: text("confirmed_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const passkeys = sqliteTable("passkeys", {
  credentialId: text("credential_id").primaryKey(),
  accessSub: text("access_sub").notNull().references(() => accountIdentities.accessSub),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const passkeyChallenges = sqliteTable("passkey_challenges", {
  accessSub: text("access_sub").notNull().references(() => accountIdentities.accessSub),
  purpose: text("purpose").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [primaryKey({ columns: [table.accessSub, table.purpose] })]);

export const editGrants = sqliteTable("edit_grants", {
  accessSub: text("access_sub").primaryKey().references(() => accountIdentities.accessSub),
  sessionNonce: text("session_nonce").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorSub: text("actor_sub").notNull(),
  occurredAt: text("occurred_at").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
});
