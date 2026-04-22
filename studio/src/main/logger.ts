export interface MainLogger {
  info(message: string, details?: unknown): void
  warn(message: string, details?: unknown): void
  error(message: string, error?: unknown): void
}

interface ConsoleLike {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

type MainLogLevel = 'INFO' | 'WARN' | 'ERROR'

function formatLogPrefix(level: MainLogLevel): string {
  return `[${new Date().toISOString()}] [${level}] [studio/main]`
}

function buildLogArgs(level: MainLogLevel, message: string, details?: unknown): unknown[] {
  const prefix = `${formatLogPrefix(level)} ${message}`
  if (details === undefined) {
    return [prefix]
  }

  return [prefix, details]
}

export function createMainLogger(output: ConsoleLike = console): MainLogger {
  return {
    info(message, details) {
      output.info(...buildLogArgs('INFO', message, details))
    },
    warn(message, details) {
      output.warn(...buildLogArgs('WARN', message, details))
    },
    error(message, error) {
      output.error(...buildLogArgs('ERROR', message, error))
    },
  }
}
