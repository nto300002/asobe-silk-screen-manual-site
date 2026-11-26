import { staffCanViewVideo, videoAccount, videoById, videoError, videoJson, youtubeId } from "@/lib/manual-videos";
import { parseBody, reply, skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { account, denied } = await videoAccount(true); if (denied) return denied;
  const row = await videoById((await context.params).id);
  if (row && !staffCanViewVideo(row,account!.role)) return reply({error:"動画が見つかりません"},404);
  return row ? reply({ video: videoJson(row) }) : reply({ error: "動画が見つかりません" }, 404);
}

export async function PATCH(request: Request, context: Context) {
  const { account, denied } = await videoAccount(true); if (denied) return denied;
  const rejected = rejectWriteRequest(request); if (rejected) return rejected;
  const id = (await context.params).id;
  const row = await videoById(id);
  if (!row) return reply({ error: "動画が見つかりません" }, 404);
  const body = await parseBody(request);
  const action = body?.action;
  const now = new Date().toISOString();
  try {
    if (action === "draft-copy") {
      if (row.status !== "published") return reply({ error: "公開版からのみ編集できます" }, 409);
      const existing = await skillDb().prepare("SELECT id FROM manual_videos WHERE entry_id = ? AND status = 'draft'").bind(row.entryId).first<{id:string}>();
      if (existing) return reply({ id: existing.id, reused: true });
      const draftId = crypto.randomUUID();
      const copied = await skillDb().prepare(`INSERT INTO manual_videos
        (id,entry_id,step_id,title,youtube_id,purpose,description,filmed_at,duration_seconds,status,version,base_published_id,created_at,updated_at,created_by)
        SELECT ?,entry_id,step_id,title,youtube_id,purpose,description,filmed_at,duration_seconds,'draft',1,id,?,?,created_by
        FROM manual_videos WHERE id = ? AND status = 'published'`)
        .bind(draftId,now,now,id).run();
      if(!copied.meta.changes)return reply({error:"公開版が変更されました。再読み込みしてください"},409);
      return reply({ id: draftId, reused: false });
    }
    if (action === "confirm-preview") {
      if (row.status !== "draft") return reply({ error: "下書きだけ確認できます" }, 409);
      if (body?.version !== row.version) return reply({ error: "下書きが更新されました。再読み込みしてください" }, 409);
      const agent=request.headers.get("user-agent")??"";
      const platform=/iPhone|iPad/i.test(agent)&&/Safari/i.test(agent)&&!/CriOS|FxiOS/i.test(agent)?"ios_safari":
        /Android/i.test(agent)&&/Chrome/i.test(agent)&&!/EdgA|OPR/i.test(agent)?"android_chrome":null;
      if(!platform)return reply({error:"iPhone SafariまたはAndroid Chromeの実機で確認してください",code:"unsupported_device"},400);
      await skillDb().prepare(`INSERT INTO manual_video_preview_checks(video_id,version,platform,actor_sub,confirmed_at)
        VALUES(?,?,?,?,?) ON CONFLICT(video_id,version,platform) DO UPDATE SET actor_sub=excluded.actor_sub,confirmed_at=excluded.confirmed_at`)
        .bind(id,row.version,platform,account!.sub,now).run();
      const checks=await skillDb().prepare("SELECT platform,confirmed_at AS confirmedAt FROM manual_video_preview_checks WHERE video_id=? AND version=?")
        .bind(id,row.version).all<{platform:string;confirmedAt:string}>();
      if(checks.results.length===2)await skillDb().prepare("UPDATE manual_videos SET preview_confirmed_at=? WHERE id=? AND version=? AND status='draft'").bind(now,id,row.version).run();
      return reply({ platform,checks:checks.results });
    }
    if (action === "publish") {
      if (row.status !== "draft" || body?.version !== row.version) return reply({ error: "下書きが更新されました。再読み込みしてください" }, 409);
      const result = await skillDb().prepare("UPDATE manual_videos SET status = 'published', updated_at = ?, version = version + 1 WHERE id = ? AND status = 'draft' AND version = ? AND preview_confirmed_at IS NOT NULL")
        .bind(now,id,row.version).run();
      if (!result.meta.changes) return reply({ error: "プレビュー確認が必要です", code: "preview_required" }, 409);
      return reply({ id, status: "published", pageUrl: videoJson(row).pageUrl });
    }
    if (action === "restore") {
      if (row.status !== "archived" || !row.archivedAt || Date.now() - Date.parse(row.archivedAt) >= 30 * 86400_000) return reply({ error: "復元期限を過ぎています" }, 409);
      const current = await skillDb().prepare("SELECT id FROM manual_videos WHERE entry_id = ? AND status = 'published'").bind(row.entryId).first<{id:string}>();
      const result = await skillDb().prepare(`UPDATE manual_videos SET status = 'draft', base_published_id = ?,
        preview_confirmed_at = NULL, archived_at = NULL, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'archived'`)
        .bind(current?.id ?? null,now,id).run();
      if (!result.meta.changes) return reply({ error: "復元できませんでした" }, 409);
      return reply({ id, status: "draft" });
    }
    if (action === "archive") {
      if (row.status === "archived") return reply({ error: "既に保管済みです" }, 409);
      const result = await skillDb().prepare("UPDATE manual_videos SET status = 'archived', archived_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
        .bind(now,now,id,row.version).run();
      if (!result.meta.changes) return reply({ error: "他の人が更新しました" }, 409);
      return reply({ id, status: "archived" });
    }
    if (action === "purge") {
      if (account!.role !== "admin" || row.status !== "archived" || !row.archivedAt || Date.now()-Date.parse(row.archivedAt)<30*86400_000) return reply({error:"完全削除できません"},403);
      await skillDb().prepare("DELETE FROM manual_video_preview_checks WHERE video_id=?").bind(id).run();
      await skillDb().prepare("DELETE FROM manual_videos WHERE id=? AND status='archived'").bind(id).run();
      return reply({id,status:"deleted"});
    }
    if (action === "save") {
      if (row.status !== "draft" || body?.version !== row.version) return reply({ error: "他の人が更新しました。再読み込みしてください" }, 409);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const youtube = youtubeId(body.youtubeUrl);
      const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0,240) : null;
      const description = typeof body.description === "string" ? body.description.trim().slice(0,2000) : null;
      const filmedAt = body.filmedAt === "" || body.filmedAt == null ? null : body.filmedAt;
      const duration = body.durationSeconds === "" || body.durationSeconds == null ? null : Number(body.durationSeconds);
      if (!title || title.length > 120 || !youtube || (filmedAt !== null && (typeof filmedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(filmedAt))) ||
          (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 86400))) return reply({ error: "入力内容を確認してください" }, 400);
      const result = await skillDb().prepare(`UPDATE manual_videos SET title=?,youtube_id=?,purpose=?,description=?,filmed_at=?,duration_seconds=?,
        preview_confirmed_at=NULL,updated_at=?,version=version+1 WHERE id=? AND status='draft' AND version=?`)
        .bind(title,youtube,purpose,description,filmedAt,duration,now,id,row.version).run();
      if (!result.meta.changes) return reply({ error: "他の人が更新しました" }, 409);
      return reply({ id, version: row.version + 1 });
    }
    return reply({ error: "操作が正しくありません" }, 400);
  } catch (error) { return videoError(error); }
}
