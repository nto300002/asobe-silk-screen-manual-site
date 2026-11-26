import { getSkillAccount, isStaff, type SkillAccount } from "@/lib/access-auth";
import { canEditManual } from "@/lib/admin-auth";
import { readManual } from "@/lib/manual-store";
import { reply, skillDb } from "@/lib/skill-db";

export type VideoRow = {
  id: string; entryId: string; stepId: string | null; title: string; youtubeId: string;
  purpose: string | null; description: string | null; filmedAt: string | null; durationSeconds: number | null;
  status: "draft" | "published" | "archived"; version: number; basePublishedId: string | null;
  previewConfirmedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string; createdBy: string;
};

export const columns = `id, entry_id AS entryId, step_id AS stepId, title, youtube_id AS youtubeId,
 purpose, description, filmed_at AS filmedAt, duration_seconds AS durationSeconds, status, version,
 base_published_id AS basePublishedId, preview_confirmed_at AS previewConfirmedAt,
 archived_at AS archivedAt, created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy`;

export async function videoAccount(editor = false): Promise<{ account: SkillAccount | null; denied: Response | null }> {
  const account = await getSkillAccount();
  if (!account) return { account, denied: reply({ error: "ログインしてください", code: "login_required" }, 401) };
  if (!account.active || account.role === "provisional") return { account, denied: reply({ error: "アカウントの承認が必要です", code: "account_denied" }, 403) };
  if (editor && !isStaff(account)) return { account, denied: reply({ error: "職員権限が必要です", code: "staff_required" }, 403) };
  if (editor && !await canEditManual(undefined)) return { account, denied: reply({ error: "パスキーで編集を許可してください", code: "passkey_required" }, 403) };
  return { account, denied: null };
}

export function youtubeId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "www.youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(?:embed|shorts)\/[^/]+$/.test(url.pathname)) id = url.pathname.split("/")[2];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export async function validStep(stepId: unknown): Promise<boolean> {
  if (stepId === null || stepId === "" || stepId === undefined) return true;
  if (typeof stepId !== "string") return false;
  const { sections } = await readManual();
  return sections.some(section => section.steps.some(step => step.id === stepId));
}

export function videoJson(row: VideoRow) {
  const publicFields = { ...row } as Omit<VideoRow,"createdBy"> & {createdBy?:string};
  delete publicFields.createdBy;
  return { ...publicFields, youtubeUrl: `https://www.youtube.com/watch?v=${row.youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${row.youtubeId}`,
    pageUrl: row.stepId ? `/manual/video/${encodeURIComponent(row.stepId)}` : `/manual/videos/${encodeURIComponent(row.entryId)}`,
    previewPageUrl: `/staff/manual/videos/${encodeURIComponent(row.id)}/preview`,
    canRestore: row.status === "archived" && !!row.archivedAt && Date.now() - Date.parse(row.archivedAt) < 30 * 86400_000,
    canPurge: row.status === "archived" && !!row.archivedAt && Date.now() - Date.parse(row.archivedAt) >= 30 * 86400_000 };
}

export function publicVideoJson(row: VideoRow) {
  return { id: row.id, entryId: row.entryId, stepId: row.stepId, title: row.title,
    purpose: row.purpose, description: row.description, filmedAt: row.filmedAt,
    durationSeconds: row.durationSeconds, status: row.status, updatedAt: row.updatedAt,
    youtubeUrl: `https://www.youtube.com/watch?v=${row.youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${row.youtubeId}`,
    pageUrl: row.stepId ? `/manual/video/${encodeURIComponent(row.stepId)}` : `/manual/videos/${encodeURIComponent(row.entryId)}` };
}

export async function videoById(id: string): Promise<VideoRow | null> {
  return await skillDb().prepare(`SELECT ${columns} FROM manual_videos WHERE id = ?`).bind(id).first<VideoRow>();
}

export function staffCanViewVideo(row: VideoRow, role: string): boolean {
  return row.status !== "archived" || role === "admin" ||
    (!!row.archivedAt && Date.now() - Date.parse(row.archivedAt) < 30 * 86400_000);
}

export async function publicVideo(field: "step_id" | "entry_id", value: string): Promise<VideoRow | null> {
  return await skillDb().prepare(`SELECT ${columns} FROM manual_videos WHERE ${field} = ? AND status = 'published'`)
    .bind(value).first<VideoRow>();
}

export function videoError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint")) return reply({ error: "この公開先には既に動画または下書きがあります", code: "duplicate" }, 409);
  if (message.includes("stale_draft")) return reply({ error: "公開版が変わりました。新しい下書きを作り直してください", code: "stale_draft" }, 409);
  if (message.includes("preview_required")) return reply({ error: "公開前にプレビュー確認が必要です", code: "preview_required" }, 409);
  console.error(error);
  return reply({ error: "動画の保存に失敗しました" }, 500);
}
