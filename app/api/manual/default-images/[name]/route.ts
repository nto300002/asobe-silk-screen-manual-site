import { defaultImageData } from "@/lib/default-image-data.mjs";
import { accountDenied, getSkillAccount } from "@/lib/access-auth";
import { reply } from "@/lib/skill-db";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const denied = accountDenied(await getSkillAccount());
  if (denied) return denied;
  const { name } = await context.params;
  const encoded = (defaultImageData as Record<string, string>)[name];
  if (!Object.hasOwn(defaultImageData, name) || !encoded) return reply({ error: "画像が見つかりません" }, 404);
  return new Response(Buffer.from(encoded, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
