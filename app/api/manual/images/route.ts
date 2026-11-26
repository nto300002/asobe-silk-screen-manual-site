import { errorReply } from "@/lib/skill-db";
import { env } from "cloudflare:workers";
import { canEditManual, getAdminStatus } from "@/lib/admin-auth";
import { reply } from "@/lib/skill-db";
import { getSkillAccount } from "@/lib/access-auth";
import { auditStatement } from "@/lib/audit-log.mjs";
import { skillDb } from "@/lib/skill-db";
import { rejectWriteRequest } from "@/lib/write-request.mjs";

const formats: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function validImage(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function POSTHandler(request: Request) {
  try {
    const status = await getAdminStatus();
    if (!await canEditManual(undefined, status)) return reply({ error: "工程の編集には職員パスキー認証が必要です" }, status.authenticated ? 403 : 401);
    const rejected = rejectWriteRequest(request, 'form');
    if (rejected) return rejected;
    const form = await request.formData();
    if (!env.BUCKET) return reply({ error: "画像の保存先が利用できません" }, 503);
    const file = form.get("image");
    if (!(file instanceof File)) return reply({ error: "画像を受け取れませんでした。もう一度選択してください。" }, 400);
    if (!formats[file.type]) return reply({ error: "画像形式が対応していません。JPEG・PNG・WebP画像を選んでください。" }, 400);
    if (file.size < 1) return reply({ error: "空の画像ファイルは保存できません。別の画像を選んでください。" }, 400);
    if (file.size > 8_000_000) return reply({ error: "画像が8 MBの上限を超えています。縮小または圧縮してから再試行してください。" }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type)) return reply({ error: "画像ファイルの内容が形式と一致しません。画像を開き直してJPEG・PNG・WebPで保存してください。" }, 400);
    const key = `manual-${crypto.randomUUID()}.${formats[file.type]}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: file.type } });
    const account = await getSkillAccount();
    await auditStatement(skillDb(), account!.sub, 'skill.manual.image.upload', key).run();
    return reply({ url: `/api/manual/images/${key}` });
  } catch (error) {
    console.error(error);
    return reply({ error: "画像の保存先でエラーが発生しました。少し待ってから再試行してください。" }, 500);
  }
}

export const POST = (...args: Parameters<typeof POSTHandler>) => POSTHandler(...args).catch(errorReply);
