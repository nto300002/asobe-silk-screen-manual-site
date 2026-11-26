import { getRawChatGPTUser, chatGPTSignInPath, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { clearSessionCookie, endSession, hasActiveSession, SESSION_COOKIE, sessionCookie, startSession } from "@/lib/idle-session";
import { cookies } from "next/headers";

function destination(request: Request): string {
  return safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to") ?? "/");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function GET(request: Request) {
  const returnTo = destination(request);
  const user = await getRawChatGPTUser();
  if (!user) {
    const signInReturn = `/session?return_to=${encodeURIComponent(returnTo)}`;
    return Response.redirect(new URL(chatGPTSignInPath(signInReturn), request.url), 307);
  }
  if (await hasActiveSession(user.userId)) {
    return Response.redirect(new URL(returnTo, request.url), 303);
  }
  const expired = (await cookies()).has(SESSION_COOKIE) || new URL(request.url).searchParams.has("expired");
  const heading = expired ? "利用を再開" : "利用を開始";
  const explanation = expired ? "無操作で60分が経過しました。下記をクリックして作業を再開します。" : "下のボタンを押して利用を開始してください。";
  const siteTitle = "シルクスクリーン スキルチェック";
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${siteTitle}｜${heading}</title><style>
    body{--accent:#244533;font-family:system-ui,sans-serif;background:#f6f4ef;color:#273024;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px;box-sizing:border-box}
    main{background:white;border:1px solid #deded4;border-radius:18px;padding:32px;width:100%;max-width:460px;box-sizing:border-box;box-shadow:0 10px 32px #0001}
    .site-brand{display:flex;align-items:center;gap:14px;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #e7e8df}
    .site-logo{width:54px;height:54px;flex:none;border-radius:13px}
    .site-label{display:block;color:var(--accent);font-size:.72rem;font-weight:700;letter-spacing:.12em}
    .site-title{display:block;margin-top:4px;color:var(--accent);font-size:1.1rem;font-weight:800;line-height:1.4}
    h1{font-size:1.5rem;margin:0 0 16px}p{line-height:1.7}button{background:var(--accent);color:white;border:0;border-radius:8px;padding:12px 22px;font:inherit;cursor:pointer;min-height:44px}button:focus-visible{outline:3px solid #a8c7ae;outline-offset:3px}
    @media(max-width:480px){main{padding:24px}.site-title{font-size:1rem}}
  </style></head><body><main><div class="site-brand"><img class="site-logo" src="/favicon.svg" alt=""><div><span class="site-label">asoBe</span><span class="site-title">${siteTitle}</span></div></div><h1>${heading}</h1><p>${explanation}</p>
    <form method="post" action="/session" target="_top"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"><button type="submit">${expired ? "作業を再開する" : "利用を開始する"}</button></form></main></body></html>`;
  const response = new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response("Invalid origin", { status: 403 });
  }
  const user = await getRawChatGPTUser();
  if (!user) return Response.redirect(new URL(chatGPTSignInPath("/session"), request.url), 303);
  const form = await request.formData();
  const returnTo = safeRelativeReturnPath(String(form.get("return_to") ?? "/"));
  await endSession();
  const token = await startSession(user.userId);
  return new Response(null, { status: 303, headers: {
    Location: new URL(returnTo, request.url).toString(),
    "Set-Cookie": sessionCookie(token),
    "Cache-Control": "no-store",
  } });
}
