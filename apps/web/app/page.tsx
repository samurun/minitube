import { UploadVideo } from "@/components/video/upload"
import { VideoList } from "@/components/video/video-list"
import { Button } from "@workspace/ui/components/button"

export default function Page() {
  return (
    <div className="container mx-auto mt-10 flex w-full flex-col gap-4">
      <UploadVideo />
      <VideoList />
    </div>
  )
}
