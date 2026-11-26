import { publicVideo, publicVideoJson, videoAccount, videoError } from "@/lib/manual-videos";
import { reply } from "@/lib/skill-db";

type Context = { params: Promise<{ key: string }> };
export async function GET(request: Request, context: Context) {
  const { denied } = await videoAccount(); if (denied) return denied;
  const { key } = await context.params;
  const field = new URL(request.url).searchParams.get("by") === "step" ? "step_id" : "entry_id";
  try {
    const row = await publicVideo(field, key);
    return row ? reply({ video: publicVideoJson(row) }) : reply({ error: "動画は現在公開されていません", code: "not_published" }, 404);
  } catch (error) { return videoError(error); }
}
