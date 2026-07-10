/** What a command may hand back to be echoed into the log: nothing, one line, or many. */
export type CommandOutput = void | string | string[]

export interface Command {
  /** Invocation name without the leading slash — lower-case, no spaces (e.g. `help`). */
  readonly name: string
  /** One-line description shown by `/help`. */
  readonly description: string
  /** When true, omit from `/help` — for easter eggs meant to be discovered, not listed. */
  readonly hidden?: boolean
  /**
   * Run the command with the raw argument string (everything after the name).
   * Return line(s) to echo into the log, or nothing. May be async; a rejected
   * promise or thrown error is surfaced to the log by the caller, not swallowed.
   */
  run(args: string): CommandOutput | Promise<CommandOutput>
}

/** A raw input line split into a command name and its argument string. */
export interface ParsedCommand {
  readonly name: string
  readonly args: string
}

/**
 * Split a console input line into `{ name, args }`, tolerating an optional leading
 * `/` and surrounding whitespace. Returns `null` for a blank line so the caller can
 * ignore an empty submit rather than dispatch a nameless command.
 */
export function parseCommandLine(raw: string): ParsedCommand | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const body = trimmed.startsWith('/') ? trimmed.slice(1).trimStart() : trimmed
  const firstSpace = body.search(/\s/)
  if (firstSpace === -1) return { name: body.toLowerCase(), args: '' }
  return { name: body.slice(0, firstSpace).toLowerCase(), args: body.slice(firstSpace + 1).trim() }
}

class CommandRegistry {
  private readonly commands = new Map<string, Command>()

  /**
   * Register a command. Fail fast on a malformed name or a duplicate: both are
   * programming bugs we want to see at boot, not a state to paper over — a silent
   * overwrite would let one command shadow another depending on import order.
   */
  register(command: Command): void {
    const { name } = command
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error(`[commands] invalid command name ${JSON.stringify(name)} — lower-case letters, digits, hyphens`)
    }
    if (this.commands.has(name)) throw new Error(`[commands] duplicate command: /${name}`)
    this.commands.set(name, command)
  }

  get(name: string): Command | undefined {
    return this.commands.get(name)
  }

  /** Every command, sorted by name so `/help` output is stable. */
  list(): readonly Command[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** The one process-wide command registry. Import and call `commands.register(...)`. */
export const commands = new CommandRegistry()

// `/help` ships with the registry so it is always present regardless of what the
// game registers later; it reads the live list at call time, so commands added
// after boot still appear.
commands.register({
  name: 'help',
  description: 'List all available commands.',
  run() {
    // Omit `help` itself (the user just ran it) and any hidden command (easter eggs).
    return commands
      .list()
      .filter((command) => command.name !== 'help' && !command.hidden)
      .map((command) => `/${command.name} — ${command.description}`)
  },
})
