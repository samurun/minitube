type VendorDocument = Document & {
  webkitExitFullscreen?: () => Promise<void>
  mozCancelFullScreen?: () => Promise<void>
  msExitFullscreen?: () => Promise<void>
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
}

type VendorHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

type VendorVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

export function getFullscreenElement(): Element | null {
  const doc = document as VendorDocument
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  )
}

export function isVideoFullscreen(video: HTMLVideoElement | null): boolean {
  return Boolean(
    (video as VendorVideoElement | null)?.webkitDisplayingFullscreen
  )
}

export async function requestFullscreen(
  element: HTMLElement,
  video?: HTMLVideoElement | null
) {
  const el = element as VendorHTMLElement

  if (el.requestFullscreen) {
    await el.requestFullscreen()
  } else if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen()
  } else if (el.mozRequestFullScreen) {
    await el.mozRequestFullScreen()
  } else if (el.msRequestFullscreen) {
    await el.msRequestFullscreen()
  } else if (video) {
    ;(video as VendorVideoElement).webkitEnterFullscreen?.()
  }
}

export async function exitFullscreen(video?: HTMLVideoElement | null) {
  const doc = document as VendorDocument

  if (document.exitFullscreen) {
    await document.exitFullscreen()
  } else if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen()
  } else if (doc.mozCancelFullScreen) {
    await doc.mozCancelFullScreen()
  } else if (doc.msExitFullscreen) {
    await doc.msExitFullscreen()
  } else if (video) {
    ;(video as VendorVideoElement).webkitExitFullscreen?.()
  }
}

const FULLSCREEN_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
] as const

export function onFullscreenChange(callback: () => void) {
  for (const event of FULLSCREEN_EVENTS) {
    document.addEventListener(event, callback)
  }

  return () => {
    for (const event of FULLSCREEN_EVENTS) {
      document.removeEventListener(event, callback)
    }
  }
}
