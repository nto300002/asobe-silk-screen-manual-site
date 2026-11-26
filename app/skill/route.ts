import { getChatGPTUser, appSessionPath } from "@/app/chatgpt-auth";
import { skillHtml } from "@/lib/skill-template.js";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(new URL(appSessionPath("/skill"), request.url), 307);
  }
  return new Response(skillHtml
    .replace("</head>", '<script defer src="/idle-session.js"></script></head>')
    .replace("/signout-with-chatgpt?return_to=%2F", "/session/logout?return_to=%2F"), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
