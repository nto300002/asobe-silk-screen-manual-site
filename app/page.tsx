import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return (
    <iframe
      title="シルクスクリーン スキルチェック"
      src="/skill"
      className="skill-frame"
    />
  );
}
