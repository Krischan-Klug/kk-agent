import type { LoopOptions, LoopResult } from "./types.js";
import { runAgentLoop } from "./lib/agent-loop.js";

export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  return runAgentLoop(opts);
}
