// Pure, framework-free application logger. A single process-wide instance so any
// module can record a line without threading an instance through, and the in-game
// developer console (`src/game/ConsoleWindow.ts`) subscribes to surface them on
// screen. No Phaser and no rendering here — this layer only holds and broadcasts
// entries; how they are drawn (timestamp/level formatting, colours) is the
// console's concern.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  /** Monotonic id, assigned in arrival order — never reused, even after eviction. */
  readonly seq: number
  /** Milliseconds since the logger loaded (monotonic; from `performance.now`). */
  readonly timeMs: number
  readonly level: LogLevel
  readonly message: string
}

export type LogListener = (entry: LogEntry) => void

/**
 * Each level is mirrored to the matching browser-console method, so a line shows
 * both in the in-game console and the devtools console. This is not a fallback
 * masking a failure — it is an intentional second sink.
 */
const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

/**
 * Newest-N ring: the buffer is capped so a long session cannot grow it without
 * bound. Older lines scroll off the top — a genuine, intended drop, not a masked
 * error.
 */
const MAX_ENTRIES = 500

class Logger {
  /** Time origin for entry timestamps; captured once when the logger loads. */
  private readonly origin = performance.now()
  private readonly entries: LogEntry[] = []
  private readonly listeners = new Set<LogListener>()
  private nextSeq = 0

  debug(message: string): void {
    this.record('debug', message)
  }
  info(message: string): void {
    this.record('info', message)
  }
  warn(message: string): void {
    this.record('warn', message)
  }
  error(message: string): void {
    this.record('error', message)
  }

  /** The current buffer, oldest→newest, as a copy so callers can't mutate our state. */
  snapshot(): readonly LogEntry[] {
    return this.entries.slice()
  }

  /**
   * Subscribe to *future* entries; returns an unsubscribe function. The backlog is
   * deliberately not replayed — a new subscriber reads `snapshot()` once for the
   * history, then listens here for everything after.
   */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private record(level: LogLevel, message: string): void {
    // Fail fast: an empty log line is a caller bug, not something to render blank.
    if (message === '') throw new Error('[log] refusing to log an empty message')
    const entry: LogEntry = {
      seq: this.nextSeq++,
      timeMs: performance.now() - this.origin,
      level,
      message,
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.shift()
    CONSOLE_METHOD[level](`[${level}] ${message}`)
    for (const listener of this.listeners) listener(entry)
  }
}

/** The one process-wide logger. Import and call `log.info(...)` etc. anywhere. */
export const log = new Logger()
