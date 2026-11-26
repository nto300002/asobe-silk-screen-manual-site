import { env } from "cloudflare:workers";

export function skillDb(): D1Database {
  if (!env.DB) throw new Error("D1データベースが利用できません");
  return env.DB;
}

export function reply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorReply(error: unknown): Response {
  console.error(error);
  return reply({ error: "保存先に接続できませんでした" }, 500);
}

export async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await request.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch { return null; }
}
