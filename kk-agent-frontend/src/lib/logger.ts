import { createScopedLogger, readLogLevel } from "@krischan-klug/kk-agent-contract";

const CURRENT_LEVEL = readLogLevel(process.env.NEXT_PUBLIC_LOG_LEVEL, "warn");

export function createLogger(scope: string) {
  return createScopedLogger(scope, CURRENT_LEVEL);
}

export type Logger = ReturnType<typeof createLogger>;
