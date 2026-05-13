export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function readLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  return value && value in LEVELS ? value as LogLevel : fallback;
}

function shouldLog(level: LogLevel, currentLevel: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function log(level: LogLevel, currentLevel: LogLevel, prefix: string, ...args: unknown[]): void {
  if (!shouldLog(level, currentLevel)) return;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(prefix, ...args);
}

export function createScopedLogger(scope: string, currentLevel: LogLevel) {
  const prefix = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => log("debug", currentLevel, prefix, ...args),
    info: (...args: unknown[]) => log("info", currentLevel, prefix, ...args),
    warn: (...args: unknown[]) => log("warn", currentLevel, prefix, ...args),
    error: (...args: unknown[]) => log("error", currentLevel, prefix, ...args),
  };
}

export type Logger = ReturnType<typeof createScopedLogger>;
