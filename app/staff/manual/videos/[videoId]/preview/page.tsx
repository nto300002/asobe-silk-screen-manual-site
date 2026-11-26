import { redirect } from "next/navigation";
import Link from "next/link";
import { appSessionPath } from "@/app/chatgpt-auth";
import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { canEditManual } from "@/lib/admin-auth";
import { staffCanViewVideo, videoById, videoJson } from "@/lib/manual-videos";
import { skillDb } from "@/lib/skill-db";
import "@/app/manual/videos/videos.css";
import PreviewConfirm from "./preview-confirm";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{videoId:string}>}) {
  const id=(await params).videoId;const path=`/staff/manual/videos/${encodeURIComponent(id)}/preview`;
  const account=await getSkillAccount(); if(!account)redirect(appSessionPath(path));
  if(!isStaff(account))return <main className="video-page"><h1>職員専用のページです</h1><Link href="/manual/videos">一覧へ戻る</Link></main>;
  if(!await canEditManual(undefined))redirect(`/passkey?return_to=${encodeURIComponent(path)}`);
  const row=await videoById(id);if(!row)return <main className="video-page"><h1>動画が見つかりません</h1><Link href="/manual/videos">一覧へ戻る</Link></main>;
  if(!staffCanViewVideo(row,account.role))return <main className="video-page"><h1>動画が見つかりません</h1><Link href="/manual/videos">一覧へ戻る</Link></main>;
  const video=videoJson(row);
  const checks=await skillDb().prepare("SELECT platform FROM manual_video_preview_checks WHERE video_id=? AND version=?").bind(id,row.version).all<{platform:string}>();
  return <main className="video-page"><nav className="video-back"><Link href={`/manual/videos?view=drafts&edit=${encodeURIComponent(id)}`}>← 下書きカードへ戻る</Link></nav><p className="video-eyebrow">STAFF PREVIEW</p><h1>{video.title}</h1><p className="video-subtitle">公開前の確認画面です。一般利用者には表示されません。</p><PreviewConfirm id={id} youtubeId={row.youtubeId} version={row.version} status={row.status} initialChecks={checks.results.map(c=>c.platform)} youtubeUrl={video.youtubeUrl} /></main>;
}
