import { redirect } from "next/navigation";
import { appSessionPath } from "@/app/chatgpt-auth";
import { getSkillAccount } from "@/lib/access-auth";
import VideoLibrary from "./video-library";
import "./videos.css";
export const dynamic = "force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{view?:string;edit?:string;new?:string;focus?:string;archive?:string}>}) {
  const account = await getSkillAccount();
  if (!account) redirect(appSessionPath("/manual/videos"));
  const query=await searchParams;
  return <VideoLibrary approved={account.active && account.role !== "provisional"} initialView={query.view} initialEdit={query.edit} initialNew={query.new==="1"} initialFocus={query.focus??query.archive} />;
}
