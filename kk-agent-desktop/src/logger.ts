type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function readLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  return value && value in LEVELS ? value as LogLevel : fallback;
}

const CURRENT_LEVEL = readLogLevel(process.env.LOG_LEVEL, "info");

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[CURRENT_LEVEL];
}

function log(level: LogLevel, prefix: string, ...args: unknown[]): void {
  if (!shouldLog(level)) return;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn(prefix, ...args);
}

export function createLogger(scope: string) {
  const prefix = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => log("debug", prefix, ...args),
    info: (...args: unknown[]) => log("info", prefix, ...args),
    warn: (...args: unknown[]) => log("warn", prefix, ...args),
    error: (...args: unknown[]) => log("error", prefix, ...args),
  };
}
