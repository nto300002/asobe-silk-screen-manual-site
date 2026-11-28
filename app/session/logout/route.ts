import { POST as logoutPost } from "@/app/auth/logout/route";

export async function GET() {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>シルクスクリーン スキルチェック｜ログアウト</title><style>
    body{font-family:system-ui,sans-serif;background:#f6f4ef;color:#273024;min-height:100vh;display:grid;place-items:center;margin:0;padding:20px;box-sizing:border-box}
    main{background:white;border:1px solid #deded4;border-radius:18px;padding:32px;width:100%;max-width:440px;box-sizing:border-box;box-shadow:0 10px 32px #0001}
    h1{font-size:1.4rem;margin:0 0 12px}p{line-height:1.7;margin:0 0 20px}
    .actions{display:flex;gap:12px;align-items:center}
    button{background:#2f5d3a;color:white;border:0;border-radius:8px;padding:12px 22px;font:inherit;font-weight:600;cursor:pointer;min-height:44px}
    a{color:#2f5d3a}
  </style></head><body><main><h1>ログアウト</h1><p>現在のセッションを終了してログアウトしますか？</p><div class="actions"><form method="post" action="/auth/logout"><button type="submit">ログアウトする</button></form><a href="/">戻る</a></div></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request) {
  return logoutPost(request);
}
