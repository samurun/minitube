import { useCallback, useEffect, useRef, useState } from "react"

interface Options {
  active: boolean
  delayMs?: number
}

/**
 * Auto-hide controls after a period of inactivity. While `active` is false,
 * controls stay visible. While true, they hide after `delayMs` of no pointer
 * movement and re-show on movement.
 */
export function useAutoHideControls({ active, delayMs = 2500 }: Options) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const show = useCallback(() => {
    clear()
    setVisible(true)
    if (active) {
      timer.current = setTimeout(() => setVisible(false), delayMs)
    }
  }, [active, delayMs, clear])

  const hide = useCallback(() => {
    clear()
    setVisible(false)
  }, [clear])

  useEffect(() => {
    if (!active) {
      clear()
      setVisible(true)
      return
    }
    show()
    return clear
  }, [active, show, clear])

  return { visible, show, hide }
}
