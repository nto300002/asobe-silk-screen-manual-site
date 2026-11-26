import VideoPlayerPage from "../../video-player-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{stepId:string}> }) {
  return <VideoPlayerPage keyId={(await params).stepId} by="step" />;
}
