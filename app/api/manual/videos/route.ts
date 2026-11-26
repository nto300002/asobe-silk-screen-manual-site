import { isStaff } from "@/lib/access-auth";
import { columns, publicVideoJson, validStep, videoAccount, videoError, youtubeId, type VideoRow } from "@/lib/manual-videos";
import { parseBody, reply, skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";

export async function GET() {
  const { account, denied } = await videoAccount();
  if (denied) return denied;
  try {
    const staff = isStaff(account!);
    const editor = staff && await import("@/lib/admin-auth").then(mod => mod.canEditManual(undefined));
    const rows = await skillDb().prepare(`SELECT ${columns} FROM manual_videos WHERE status = 'published' ORDER BY updated_at DESC`).all<VideoRow>();
    return reply({ videos: rows.results.map(publicVideoJson), staff, editor, admin: account!.role === "admin" });
  } catch (error) { return videoError(error); }
}

export async function POST(request: Request) {
  const { account, denied } = await videoAccount(true);
  if (denied) return denied;
  const rejected = rejectWriteRequest(request); if (rejected) return rejected;
  const body = await parseBody(request);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const id = youtubeId(body?.youtubeUrl);
  const stepId = body?.stepId || null;
  if (!title || title.length > 120 || !id || !await validStep(stepId)) return reply({ error: "タイトル・YouTube URL・工程を確認してください" }, 400);
  try {
    if (stepId) {
      const conflict = await skillDb().prepare("SELECT id FROM manual_videos WHERE step_id = ? AND status IN ('draft','published') LIMIT 1").bind(stepId).first();
      if (conflict) return reply({ error: "この工程には既に動画があります。公開カードから編集してください", code: "duplicate_step" }, 409);
    }
    const now = new Date().toISOString();
    const row = { id: crypto.randomUUID(), entryId: crypto.randomUUID(), stepId, title, youtubeId: id, now };
    await skillDb().prepare(`INSERT INTO manual_videos
      (id,entry_id,step_id,title,youtube_id,status,version,created_at,updated_at,created_by)
      VALUES (?,?,?,?,?,'draft',1,?,?,?)`)
      .bind(row.id,row.entryId,row.stepId,row.title,row.youtubeId,now,now,account!.sub).run();
    return reply({ id: row.id, entryId: row.entryId, status: "draft" }, 201);
  } catch (error) { return videoError(error); }
}
