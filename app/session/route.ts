import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { googleSignInPath, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { isSecureOrigin, resolveAppOrigin } from "@/lib/google-oidc-core.mjs";
import { clearSessionCookie, getActiveSession, SESSION_COOKIE } from "@/lib/idle-session";

function destination(request: Request): string {
  return safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to") ?? "/");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function errorMessageFor(code: string | null): string | null {
  if (!code) return null;
  if (code === "google_denied") return "Google アカウントでのログインがキャンセルされました。もう一度お試しください。";
  if (code === "invalid_state") return "ログインの有効期限が切れたか、状態が一致しませんでした。もう一度お試しください。";
  if (code === "oauth_not_configured") return "Google 認証の設定が未完了です。管理者へご連絡ください。";
  return "ログインの確認に失敗しました。時間をおいてもう一度お試しください。";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = destination(request);
  const origin = resolveAppOrigin(request.url, env.APP_ORIGIN);
  const secure = isSecureOrigin(origin);

  if (await getActiveSession()) {
    return Response.redirect(new URL(returnTo, origin), 303);
  }

  const expired = (await cookies()).has(SESSION_COOKIE) || url.searchParams.has("expired");
  const loggedOut = url.searchParams.has("logged_out");
  const errorMessage = errorMessageFor(url.searchParams.get("error"));
  const oauthReady = Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());

  const heading = expired ? "利用を再開" : loggedOut ? "ログアウトしました" : "Google アカウントでログイン";
  const explanation = errorMessage
    ?? (expired
      ? "無操作で60分が経過しました。Google アカウントで再ログインして作業を再開してください。"
      : loggedOut
        ? "ログアウトが完了しました。再度利用する場合は Google アカウントでログインしてください。"
        : "シルクスクリーン スキルチェックを利用するには、Google アカウントでログインしてください。");

  const siteTitle = "シルクスクリーン スキルチェック";
  const signInHref = escapeHtml(googleSignInPath(returnTo));
  const noticeHtml = errorMessage
    ? `<p class="notice error" role="alert">${escapeHtml(errorMessage)}</p>`
    : `<p>${escapeHtml(explanation)}</p>`;
  const actionHtml = oauthReady
    ? `<a class="login-btn" href="${signInHref}">Google アカウントでログイン</a>`
    : `<p class="notice warn">Google 認証環境変数（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）が未設定のためログインできません。</p>`;

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${siteTitle}｜${escapeHtml(heading)}</title><style>
    body{--accent:#2f5d3a;font-family:system-ui,sans-serif;background:#f6f4ef;color:#273024;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px;box-sizing:border-box}
    main{background:white;border:1px solid #deded4;border-radius:18px;padding:32px;width:100%;max-width:460px;box-sizing:border-box;box-shadow:0 10px 32px #0001}
    .site-brand{display:flex;align-items:center;gap:14px;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #e7e8df}
    .site-label{display:block;color:var(--accent);font-size:.72rem;font-weight:700;letter-spacing:.12em}
    .site-title{display:block;margin-top:4px;color:var(--accent);font-size:1.1rem;font-weight:800;line-height:1.4}
    h1{font-size:1.4rem;margin:0 0 14px}p{line-height:1.7;margin:0 0 18px}
    .notice{padding:12px 14px;border-radius:10px;font-size:.95rem}
    .notice.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .notice.warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
    .login-btn{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:white;text-decoration:none;border:0;border-radius:8px;padding:12px 22px;font:inherit;font-weight:600;min-height:44px;box-sizing:border-box}
    .login-btn:focus-visible{outline:3px solid #a8c7ae;outline-offset:3px}
    @media(max-width:480px){main{padding:24px}.site-title{font-size:1rem}}
  </style></head><body><main><div class="site-brand"><div><span class="site-label">asoBe</span><span class="site-title">${siteTitle}</span></div></div><h1>${escapeHtml(heading)}</h1>${noticeHtml}${actionHtml}</main></body></html>`;

  const response = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  response.headers.set("Set-Cookie", clearSessionCookie(secure));
  return response;
}
