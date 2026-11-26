import { columns, videoAccount, videoError, videoJson, type VideoRow } from "@/lib/manual-videos";
import { reply, skillDb } from "@/lib/skill-db";

export async function GET() {
  const { account, denied } = await videoAccount(true); if (denied) return denied;
  try {
    const rows = await skillDb().prepare(`SELECT ${columns} FROM manual_videos WHERE status != 'archived' OR ? = 'admin' OR archived_at > ? ORDER BY updated_at DESC`)
      .bind(account!.role,new Date(Date.now()-30*86400_000).toISOString()).all<VideoRow>();
    return reply({ videos: rows.results.map(videoJson) });
  } catch (error) { return videoError(error); }
}
