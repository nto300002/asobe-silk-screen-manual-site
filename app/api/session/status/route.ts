import { sessionExpiresAt } from "@/lib/idle-session";

export async function GET() {
  const expiresAt = await sessionExpiresAt();
  if (expiresAt === null) {
    return Response.json({ error: "SESSION_EXPIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
