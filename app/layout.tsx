import type { Metadata } from "next";
import "./globals.css";
import PendingNotice from "./pending-notice";

export const metadata: Metadata = {
  title: "シルクスクリーン スキルチェック | asobe",
  description: "シルクスクリーン制作の工程を学び、利用者ごとの進捗を保存できるスキルチェックアプリ。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body><PendingNotice />{children}<script defer src="/idle-session.js" /></body>
    </html>
  );
}
