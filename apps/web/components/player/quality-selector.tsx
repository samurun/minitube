import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { SettingsIcon } from "lucide-react"
import type { QualityLevel } from "@/hooks/use-hls"

export function QualitySelector({
  levels,
  currentLevel,
  onSelect,
}: {
  levels: QualityLevel[]
  currentLevel: number
  onSelect: (index: number) => void
}) {
  if (levels.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          aria-label="Video quality"
          className="rounded-full bg-black/20 hover:bg-black/30"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="min-w-32"
        // Prevent click from bubbling to the player's play/pause layer
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuRadioGroup
          value={String(currentLevel)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <DropdownMenuRadioItem value="-1">Auto</DropdownMenuRadioItem>
          {levels.map((level) => (
            <DropdownMenuRadioItem
              key={level.index}
              value={String(level.index)}
            >
              {level.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
