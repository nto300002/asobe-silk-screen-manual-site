import { redirect } from "next/navigation";
import Link from "next/link";
import { appSessionPath } from "@/app/chatgpt-auth";
import { getSkillAccount } from "@/lib/access-auth";
import { readManual } from "@/lib/manual-store";
import { publicVideo, videoJson } from "@/lib/manual-videos";
import "./videos/videos.css";

export default async function VideoPlayerPage({keyId, by}: {keyId:string;by:"step"|"entry"}) {
  const path = by === "step" ? `/manual/video/${encodeURIComponent(keyId)}` : `/manual/videos/${encodeURIComponent(keyId)}`;
  const account = await getSkillAccount();
  if (!account) redirect(appSessionPath(path));
  if (!account.active || account.role === "provisional") return <main className="video-page"><h1>アカウントの承認が必要です</h1><Link href="/skill">工程一覧へ</Link></main>;
  const { sections } = await readManual();
  const meta = by === "step" ? sections.flatMap(section => section.steps.map(step => ({step,section}))).find(item => item.step.id === keyId) : null;
  if (by === "step" && !meta) return <main className="video-page"><h1>工程が見つかりません</h1><Link href="/skill">工程一覧へ</Link></main>;
  const row = await publicVideo(by === "step" ? "step_id" : "entry_id", keyId);
  const video = row ? videoJson(row) : null;
  return <main className="video-page">
    <nav className="video-back"><Link href="/manual/videos">← 動画マニュアル一覧</Link>{meta && <Link href="/skill">工程一覧</Link>}</nav>
    <p className="video-eyebrow">SILK SCREEN / VIDEO MANUAL</p>
    <h1>{video?.title ?? meta?.step.title ?? "動画マニュアル"}</h1>
    {meta && <p className="video-subtitle">{meta.section.title} / {meta.step.title}</p>}
    {video ? <>
      <div className="video-frame"><iframe title={`${video.title}の動画`} src={video.embedUrl} allow="encrypted-media; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
      <a className="video-external" href={video.youtubeUrl} target="_blank" rel="noopener noreferrer">YouTubeで開く ↗</a>
      {video.purpose && <p className="video-purpose">{video.purpose}</p>}
      <div className="video-meta">{video.durationSeconds && <span>再生時間 {Math.ceil(video.durationSeconds/60)}分</span>}{video.filmedAt && <span>撮影日 {video.filmedAt}</span>}<span>更新日 {video.updatedAt.slice(0,10)}</span></div>
      {video.description && <section className="video-notes"><h2>補足・注意点</h2><p>{video.description}</p></section>}
    </> : <section className="video-empty"><h2>動画は現在公開されていません</h2><p>文章の手順は工程一覧から確認できます。</p></section>}
    {meta && <section className="video-notes"><h2>作業のポイント</h2><p>{meta.step.description}</p><ul>{meta.step.items.map((item,index)=><li key={index}>{item}</li>)}</ul><a className="video-primary" href={`/skill?step=${encodeURIComponent(keyId)}`}>この工程のスキルチェックへ →</a></section>}
  </main>;
}
