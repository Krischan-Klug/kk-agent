import { createScopedLogger, readLogLevel } from "@krischan-klug/kk-agent-contract";

const CURRENT_LEVEL = readLogLevel(process.env.LOG_LEVEL, "info");

export function createLogger(scope: string) {
  return createScopedLogger(scope, CURRENT_LEVEL);
}
