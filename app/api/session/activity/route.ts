import { getRawChatGPTUser } from "@/app/chatgpt-auth";
import { touchSession } from "@/lib/idle-session";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const user = await getRawChatGPTUser();
  if (!user || !await touchSession(user.userId)) {
    return Response.json({ error: "SESSION_EXPIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
