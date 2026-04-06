import { Button } from "@workspace/ui/components/button"
import { PlayIcon } from "lucide-react"

export function PlayOverlay({
  visible,
  onPlay,
}: {
  visible: boolean
  onPlay: () => void
}) {
  if (!visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation()
          onPlay()
        }}
        aria-label="Play video"
        className="pointer-events-auto relative size-16 rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md hover:bg-black/70"
      >
        <PlayIcon className="size-6 fill-current" />
      </Button>
    </div>
  )
}
