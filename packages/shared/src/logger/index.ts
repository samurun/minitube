type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

interface LogEntry {
  level: LogLevel
  msg: string
  service: string
  time: string
  [key: string]: unknown
}

interface Logger {
  debug: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  error: (msg: string, ctx?: Record<string, unknown>) => void
  child: (defaultCtx: Record<string, unknown>) => Logger
}

const minLevel: LogLevel =
  ((globalThis.process?.env?.LOG_LEVEL ?? Bun.env.LOG_LEVEL) as
    | LogLevel
    | undefined) ?? "info"

function emit(entry: LogEntry) {
  const out = JSON.stringify(entry)
  if (entry.level === "error") {
    console.error(out)
  } else {
    console.log(out)
  }
}

function makeLogger(
  service: string,
  defaultCtx: Record<string, unknown> = {}
): Logger {
  function log(
    level: LogLevel,
    msg: string,
    ctx?: Record<string, unknown>
  ) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
    emit({
      level,
      msg,
      service,
      time: new Date().toISOString(),
      ...defaultCtx,
      ...ctx,
    })
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child: (childCtx) =>
      makeLogger(service, { ...defaultCtx, ...childCtx }),
  }
}

export function createLogger(service: string): Logger {
  return makeLogger(service)
}

export type { Logger }
