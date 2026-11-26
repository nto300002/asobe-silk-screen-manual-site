"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";

type Video = {id:string;entryId:string;stepId:string|null;title:string;purpose:string|null;description:string|null;filmedAt:string|null;durationSeconds:number|null;status:"published"|"draft"|"archived";version:number;youtubeUrl:string;embedUrl:string;pageUrl:string;previewPageUrl:string;previewConfirmedAt:string|null;archivedAt:string|null;canRestore:boolean;canPurge:boolean};
type Tab = "published"|"draft"|"archived";
type Draft = {title:string;youtubeUrl:string;stepId:string;purpose:string;description:string;filmedAt:string;durationSeconds:string};
const draftFrom = (video?:Video):Draft => ({title:video?.title??"",youtubeUrl:video?.youtubeUrl??"",stepId:video?.stepId??"",purpose:video?.purpose??"",description:video?.description??"",filmedAt:video?.filmedAt??"",durationSeconds:video?.durationSeconds?.toString()??""});
async function request<T>(url:string, init?:RequestInit):Promise<T> {
  const response=await fetch(url,{cache:"no-store",...init,headers:{...init?.headers,"Content-Type":"application/json"}});
  const data=await response.json().catch(()=>({})) as {error?:string;code?:string};
  if(!response.ok) { const error=new Error(data.error??`HTTP ${response.status}`) as Error & {code?:string}; error.code=data.code; throw error; }
  return data as T;
}
function passkeyUrl(returnTo:string) {return `/passkey?return_to=${encodeURIComponent(returnTo)}`;}

export default function VideoLibrary({approved,initialView,initialEdit,initialNew,initialFocus}:{approved:boolean;initialView?:string;initialEdit?:string;initialNew:boolean;initialFocus?:string}) {
  const [videos,setVideos]=useState<Video[]>([]); const [staff,setStaff]=useState(false); const [editor,setEditor]=useState(false); const [admin,setAdmin]=useState(false);
  const [tab,setTab]=useState<Tab>(initialView==="drafts"?"draft":initialView==="archived"?"archived":"published"); const [filter,setFilter]=useState("all"); const [query,setQuery]=useState("");
  const [editing,setEditing]=useState<string|null>(initialEdit??(initialNew?"new":null)); const [draft,setDraft]=useState<Draft>(draftFrom());
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [qr,setQr]=useState<{url:string;data:string}|null>(null);
  const [steps,setSteps]=useState<{id:string;name:string}[]>([]);
  useEffect(()=>{
    request<{sections:{title:string;steps:{id:string;title:string}[]}[]}>("/api/manual").then(data=>setSteps(data.sections.flatMap(s=>s.steps.map(st=>({id:st.id,name:`${s.title} / ${st.title}`}))))).catch(()=>{});
    refresh();
  },[]);
  useEffect(()=>{if(initialFocus)document.querySelector(`[data-entry-id="${CSS.escape(initialFocus)}"], [data-video-id="${CSS.escape(initialFocus)}"]`)?.scrollIntoView({block:"center"});},[videos,initialFocus]);
  async function refresh(){
    try {
      const publicData=await request<{videos:Video[];staff:boolean;editor:boolean;admin:boolean}>("/api/manual/videos");
      setStaff(publicData.staff); setEditor(publicData.editor);setAdmin(publicData.admin);
      if(publicData.editor){ const managed=await request<{videos:Video[]}>("/api/manual/videos/manage");setVideos(managed.videos); const edit=new URL(location.href).searchParams.get("edit");if(edit){const found=managed.videos.find(v=>v.id===edit);if(found)setDraft(draftFrom(found));else{setEditing(null);setMessage("指定された下書きが見つかりません");}} }
      else setVideos(publicData.videos);
    } catch(error){setMessage((error as Error).message);}
  }
  function startEdit(video?:Video){setDraft(draftFrom(video));setEditing(video?.id??"new");setMessage("");history.replaceState(null,"",video?`/manual/videos?view=drafts&edit=${encodeURIComponent(video.id)}`:"/manual/videos?new=1");}
  function cardReturn(video?:Video){return video ? video.status==="archived"?`/manual/videos?view=archived&archive=${encodeURIComponent(video.id)}`:`/manual/videos?view=${video.status==="draft"?"drafts":"published"}&${video.status==="draft"?"edit":"focus"}=${encodeURIComponent(video.status==="draft"?video.id:video.entryId)}` : "/manual/videos?new=1";}
  async function mutation(video:Video,action:string){
    setBusy(true);setMessage("");
    try {
      const data=await request<{id?:string}>(`/api/manual/videos/${video.id}`,{method:"PATCH",headers:{Origin:location.origin},body:JSON.stringify({action,version:video.version})});
      if(action==="draft-copy"||action==="restore") {setTab("draft");setEditing(data.id??null);history.replaceState(null,"",`/manual/videos?view=drafts&edit=${data.id}`);}
      else setEditing(null);
      await refresh();
    }catch(error){ const err=error as Error&{code?:string}; if(err.code==="passkey_required")location.href=passkeyUrl(cardReturn(video));else setMessage(err.message); }
    finally{setBusy(false);}
  }
  async function save(){
    setBusy(true);setMessage("");
    const video=videos.find(v=>v.id===editing);
    try {
      if(video) await request(`/api/manual/videos/${video.id}`,{method:"PATCH",headers:{Origin:location.origin},body:JSON.stringify({...draft,action:"save",version:video.version})});
      else { const data=await request<{id:string}>("/api/manual/videos",{method:"POST",headers:{Origin:location.origin},body:JSON.stringify(draft)});setEditing(data.id);setTab("draft");history.replaceState(null,"",`/manual/videos?view=drafts&edit=${data.id}`); }
      await refresh();setMessage("下書きを保存しました。プレビューで確認してください。");
    }catch(error){const err=error as Error&{code?:string};if(err.code==="passkey_required")location.href=passkeyUrl(cardReturn(video));else setMessage(err.message);}
    finally{setBusy(false);}
  }
  async function showQr(video:Video,preview=false){const url=new URL(preview?video.previewPageUrl:video.pageUrl,location.origin).href;const data=await QRCode.toDataURL(url,{width:360,margin:2});setQr({url,data});}
  const visible=videos.filter(v=>v.status===tab).filter(v=>filter==="all"||(filter==="step"?!!v.stepId:!v.stepId)).filter(v=>`${v.title} ${v.purpose??""}`.toLowerCase().includes(query.toLowerCase()));
  if(!approved)return <main className="video-page"><h1>アカウントの承認が必要です</h1><a href="/skill">工程一覧へ戻る</a></main>;
  return <main className="video-page video-library">
    <nav className="video-back"><a href="/skill">← 工程一覧へ戻る</a></nav>
    <p className="video-eyebrow">SILK SCREEN / VIDEO MANUAL</p><h1>動画マニュアル一覧</h1><p className="video-subtitle">工程の動画と、その他の作業動画を探せます。</p>
    {staff&&!editor&&<p className="video-notice">動画の編集にはパスキー認証が必要です。<a href={passkeyUrl("/manual/videos")}>編集を許可する →</a></p>}
    {editor&&<div className="video-toolbar"><button className="video-primary" onClick={()=>{startEdit();history.replaceState(null,"","/manual/videos?new=1");}}>＋ 動画を追加</button><div className="video-tabs" role="tablist">{([["published","公開"],["draft","下書き"],["archived","保管済み"]] as const).map(([value,label])=><button key={value} role="tab" aria-selected={tab===value} onClick={()=>{setTab(value);setEditing(null);history.replaceState(null,"",`/manual/videos?view=${value}`);}}>{label}</button>)}</div></div>}
    <div className="video-filters"><label>タイトル検索<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="動画を検索" /></label><label>分類<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">すべて</option><option value="step">工程の動画</option><option value="other">その他の動画</option></select></label></div>
    {message&&<p className="video-notice" role="status">{message}</p>}
    {editing==="new"&&<EditCard value={draft} setValue={setDraft} steps={steps} busy={busy} onSave={save} onCancel={()=>{setEditing(null);history.replaceState(null,"","/manual/videos");}} />}
    <div className="video-grid">{visible.map(video=><article className="video-card" key={video.id} data-entry-id={video.entryId} data-video-id={video.id}>
      {editing===video.id?<EditCard value={draft} setValue={setDraft} steps={steps} busy={busy} onSave={save} onCancel={()=>{setEditing(null);history.replaceState(null,"","/manual/videos?view=drafts");}} lockedStep />:<>
        <div className="video-card-icon">▶</div><div className="video-card-body"><span className="video-card-category">{video.stepId?steps.find(s=>s.id===video.stepId)?.name??"工程の動画":"その他の動画"}</span><h2>{video.title}</h2>{video.purpose&&<p>{video.purpose}</p>}{video.status==="archived"&&<p>保管日: {video.archivedAt?.slice(0,10)}</p>}</div>
        <div className="video-card-actions">{video.status==="published"&&<a className="video-action-primary" href={video.pageUrl}>動画を見る →</a>}
          {editor&&video.status==="published"&&<><button disabled={busy} onClick={()=>mutation(video,"draft-copy")}>編集</button><button onClick={()=>showQr(video)}>QRコード</button><button disabled={busy} onClick={()=>{if(confirm("この動画を非公開にしますか？"))mutation(video,"archive");}}>保管</button></>}
          {editor&&video.status==="draft"&&<><button onClick={()=>startEdit(video)}>編集</button><a href={video.previewPageUrl}>プレビュー</a><button onClick={()=>showQr(video,true)}>プレビュー用QR</button><button disabled={busy||!video.previewConfirmedAt} onClick={()=>mutation(video,"publish")}>公開</button><button disabled={busy} onClick={()=>{if(confirm("下書きを取り下げますか？"))mutation(video,"archive");}}>取り下げる</button></>}
          {editor&&video.status==="archived"&&video.canRestore&&<button disabled={busy} onClick={()=>mutation(video,"restore")}>下書きに復元</button>}
          {admin&&editor&&video.status==="archived"&&video.canPurge&&<button disabled={busy} onClick={()=>{if(confirm("この保管済み動画を完全削除しますか？"))mutation(video,"purge");}}>完全削除</button>}
        </div></>}
    </article>)}</div>
    {!visible.length&&<p className="video-empty">{query?"検索結果がありません":tab==="published"?"公開中の動画はありません":"この状態の動画はありません"}</p>}
    {qr&&<div className="video-qr-backdrop" onClick={()=>setQr(null)}><div className="video-qr-dialog" role="dialog" aria-label="QRコード" onClick={e=>e.stopPropagation()}><h2>動画のQRコード</h2><Image src={qr.data} alt="動画ページのQRコード" width={300} height={300} unoptimized /><p>{qr.url}</p><a className="video-primary" href={qr.data} download="video-manual-qr.png">画像を保存</a><button onClick={()=>setQr(null)}>閉じる</button></div></div>}
  </main>;
}

function EditCard({value,setValue,steps,busy,onSave,onCancel,lockedStep=false}:{value:Draft;setValue:(v:Draft)=>void;steps:{id:string;name:string}[];busy:boolean;onSave:()=>void;onCancel:()=>void;lockedStep?:boolean}){
  const set=(key:keyof Draft)=>(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setValue({...value,[key]:e.target.value});
  return <form className="video-card video-edit" onSubmit={e=>{e.preventDefault();onSave();}}><h2>動画マニュアルを編集</h2><label>タイトル <strong>必須</strong><input required maxLength={120} value={value.title} onChange={set("title")} /></label><label>YouTube URL <strong>必須</strong><input required type="url" value={value.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://youtu.be/..." /></label>
    <label>紐付け先<select disabled={lockedStep} value={value.stepId} onChange={set("stepId")}><option value="">その他の動画（工程なし）</option>{steps.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <label>目的<input value={value.purpose} onChange={set("purpose")} maxLength={240} /></label><label>補足・注意点<textarea value={value.description} onChange={set("description")} maxLength={2000} /></label><div className="video-edit-row"><label>撮影日<input type="date" value={value.filmedAt} onChange={set("filmedAt")} /></label><label>再生時間（秒）<input type="number" min="1" max="86400" value={value.durationSeconds} onChange={set("durationSeconds")} /></label></div>
    <div className="video-card-actions"><button className="video-action-primary" type="submit" disabled={busy}>{busy?"保存中…":"保存"}</button><button type="button" onClick={onCancel}>キャンセル</button></div></form>;
}
