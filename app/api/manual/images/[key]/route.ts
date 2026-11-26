import { errorReply } from "@/lib/skill-db";
import { env } from "cloudflare:workers";
import { reply } from "@/lib/skill-db";
import { accountDenied, getSkillAccount } from "@/lib/access-auth";

async function GETHandler(_request: Request, context: { params: Promise<{ key: string }> }) {
  const denied = accountDenied(await getSkillAccount());
  if (denied) return denied;
  const { key } = await context.params;
  if (!/^manual-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(key)) return reply({ error: "画像が見つかりません" }, 404);
  if (!env.BUCKET) return reply({ error: "画像の保存先が利用できません" }, 503);
  const object = await env.BUCKET.get(key);
  if (!object) return reply({ error: "画像が見つかりません" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
