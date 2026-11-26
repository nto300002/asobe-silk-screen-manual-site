"use client";
import { useEffect, useRef, useState } from "react";

type Player = {destroy:()=>void};
type YTWindow = Window & {YT?:{Player:new (element:HTMLElement,options:unknown)=>Player};onYouTubeIframeAPIReady?:()=>void};
export default function PreviewConfirm({id,youtubeId,version,status,initialChecks,youtubeUrl}:{id:string;youtubeId:string;version:number;status:string;initialChecks:string[];youtubeUrl:string}){
  const host=useRef<HTMLDivElement>(null);const [played,setPlayed]=useState(false);const [checks,setChecks]=useState(initialChecks);const [agreed,setAgreed]=useState(false);const [error,setError]=useState("");
  const platform=typeof navigator==="undefined"?null:/iPhone|iPad/i.test(navigator.userAgent)&&/Safari/i.test(navigator.userAgent)&&!/CriOS|FxiOS/i.test(navigator.userAgent)?"ios_safari":/Android/i.test(navigator.userAgent)&&/Chrome/i.test(navigator.userAgent)&&!/EdgA|OPR/i.test(navigator.userAgent)?"android_chrome":null;
  useEffect(()=>{
    const win=window as YTWindow;let player:Player|undefined;let stopped=false;
    const init=()=>{if(stopped||!host.current||!win.YT?.Player)return;player=new win.YT.Player(host.current,{videoId:youtubeId,playerVars:{playsinline:1,rel:0},events:{onStateChange:(event:{data:number})=>{if(event.data===1)setPlayed(true);}}});};
    if(win.YT?.Player)init();else {win.onYouTubeIframeAPIReady=init;const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;document.head.appendChild(script);}
    return()=>{stopped=true;player?.destroy();};
  },[youtubeId]);
  return <><div className="video-frame"><div ref={host} /></div><a className="video-external" href={youtubeUrl} target="_blank" rel="noopener noreferrer">YouTubeで開く ↗</a>
    <section className="video-notes"><h2>公開前の実機確認</h2><p>iPhone SafariとAndroid Chromeの両方でこのURLを開き、再生開始・一時停止・シーク・音声を確認してください。再生が始まると、この端末の確認操作が有効になります。</p>
      <ul><li>iPhone Safari: {checks.includes("ios_safari")?"確認済み":"未確認"}</li><li>Android Chrome: {checks.includes("android_chrome")?"確認済み":"未確認"}</li></ul>
      {status==="draft"&&<><label className="video-confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} /> この端末で再生・一時停止・シーク・音声を確認しました</label>
        <button className="video-primary" disabled={!played||!agreed||!platform||checks.includes(platform)} onClick={async()=>{setError("");try{const response=await fetch(`/api/manual/videos/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"confirm-preview",version})});const data=await response.json() as {error?:string;checks?:{platform:string}[]};if(!response.ok)throw new Error(data.error??"確認を保存できませんでした");setChecks(data.checks?.map(c=>c.platform)??checks);}catch(e){setError((e as Error).message);}}}>{platform?checks.includes(platform)?"この端末は確認済み":"この端末で再生を確認":"対象端末で開いてください"}</button></>}
      {error&&<p role="alert">{error}</p>}<p><a href={`/manual/videos?view=drafts&edit=${encodeURIComponent(id)}`}>下書きカードへ戻る →</a></p></section></>;
}
