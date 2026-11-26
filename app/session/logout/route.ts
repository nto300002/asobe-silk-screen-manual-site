import { safeRelativeReturnPath, sitesSignOutPath } from "@/app/chatgpt-auth";
import { clearSessionCookie, endSession } from "@/lib/idle-session";

export async function GET(request: Request) {
  const returnTo = safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to") ?? "/");
  await endSession();
  return new Response(null, { status: 303, headers: {
    Location: new URL(sitesSignOutPath(returnTo), request.url).toString(),
    "Set-Cookie": clearSessionCookie(),
    "Cache-Control": "no-store",
  } });
}
