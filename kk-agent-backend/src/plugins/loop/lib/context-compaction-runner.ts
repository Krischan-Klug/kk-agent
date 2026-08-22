import {
  getMessageText,
  getToolUses,
  type ModelCompactionProfile,
  type ModelInputDebug,
  type TranscriptUsage,
} from "kk-agent-contract";
import type { UnifiedResponse } from "../../provider/lib/types.js";
import {
  buildCompactionEvidence,
  estimateCompactionTokens,
  validateCompactionSummary,
} from "./context-compaction.js";
import type { TranscriptMessage } from "kk-agent-contract";

type CompactionStage = "segment" | "merge" | "final" | "repair";

export interface CompactionPassRequest {
  evidence: string;
  stage: CompactionStage;
  pass: number;
  repairCandidate?: { summary: string; errors: string[] };
}

export interface CompactionPassExecution {
  response: UnifiedResponse;
  debugInputId?: string;
}

export interface CompactionRunnerResult {
  summary: string;
  debugInputId?: string;
  outcome: NonNullable<ModelInputDebug["outcome"]>;
  evidence: {
    sourceChars: number;
    rawReasoningChars: number;
    passes: number;
  };
}

interface ValidatedPass {
  summary: string;
  execution: CompactionPassExecution;
  outcome: NonNullable<ModelInputDebug["outcome"]>;
}

class CompactionPassError extends Error {
  constructor(
    message: string,
    readonly lengthLimited: boolean,
    readonly execution: CompactionPassExecution,
    readonly outcome: NonNullable<ModelInputDebug["outcome"]>,
  ) {
    super(message);
    this.name = "CompactionPassError";
  }
}

function usage(response: UnifiedResponse): TranscriptUsage | undefined {
  return response.stats ? {
    inputTokens: response.stats.inputTokens,
    outputTokens: response.stats.outputTokens,
    reasoningTokens: response.stats.reasoningTokens,
  } : undefined;
}

function splitInHalf(value: string): [string, string] {
  const middle = Math.floor(value.length / 2);
  const before = value.lastIndexOf("\n\n", middle);
  const after = value.indexOf("\n\n", middle);
  const split = before > value.length * 0.3
    ? before
    : after > 0 && after < value.length * 0.7 ? after : middle;
  return [value.slice(0, split).trim(), value.slice(split).trim()];
}

function combinedEvidence(parts: string[]): string {
  return parts.map((part, index) => `### Partial continuation state ${index + 1}\n${part}`).join("\n\n");
}

export async function runContextCompaction(input: {
  messages: TranscriptMessage[];
  contextLimit: number;
  profile: ModelCompactionProfile;
  execute: (request: CompactionPassRequest) => Promise<CompactionPassExecution>;
  onOutcome?: (
    debugInputId: string,
    outcome: NonNullable<ModelInputDebug["outcome"]>,
  ) => void | Promise<void>;
}): Promise<CompactionRunnerResult> {
  const fixedReserveTokens = Math.max(1_500, Math.ceil(input.contextLimit * 0.03));
  const inputBudgetTokens = Math.max(4_000, Math.min(
    Math.floor(input.contextLimit * input.profile.inputBudgetRatio),
    input.contextLimit - input.profile.maxOutputTokens - fixedReserveTokens,
  ));
  const evidence = buildCompactionEvidence(input.messages);
  let pass = 0;

  const executeValidated = async (
    value: string,
    stage: Exclude<CompactionStage, "repair">,
  ): Promise<ValidatedPass> => {
    pass += 1;
    const execution = await input.execute({ evidence: value, stage, pass });
    const summary = getMessageText(execution.response.message).trim();
    const errors = validateCompactionSummary({
      summary,
      finishReason: execution.response.finishReason,
      hasToolUses: getToolUses(execution.response.message).length > 0,
      hasParseErrors: (execution.response.parseIssues ?? []).some((issue) => issue.severity === "error"),
      sourceChars: value.length,
    });
    const outcome: NonNullable<ModelInputDebug["outcome"]> = {
      status: errors.length === 0 ? "accepted" : "rejected",
      compactionPass: pass,
      compactionStage: stage,
      evidenceChars: value.length,
      finishReason: execution.response.finishReason,
      ...(usage(execution.response) ? { usage: usage(execution.response) } : {}),
      output: summary,
      ...(errors.length > 0 ? { validationErrors: errors } : {}),
    };
    if (execution.debugInputId) await input.onOutcome?.(execution.debugInputId, outcome);
    if (errors.length === 0) return { summary, execution, outcome };

    const lengthLimited = execution.response.finishReason === "length";
    if (lengthLimited) {
      const reasoningOnly = !summary && (execution.response.stats?.reasoningTokens ?? 0) > 0;
      throw new CompactionPassError(
        reasoningOnly
          ? "Compaction exhausted its output budget on reasoning without producing continuation text."
          : "Compaction reached its output limit before producing a valid continuation state.",
        true,
        execution,
        outcome,
      );
    }
    if (!summary) {
      throw new CompactionPassError("Compaction returned no continuation text.", false, execution, outcome);
    }

    pass += 1;
    const repairExecution = await input.execute({
      evidence: value,
      stage: "repair",
      pass,
      repairCandidate: { summary, errors },
    });
    const repaired = getMessageText(repairExecution.response.message).trim();
    const repairErrors = validateCompactionSummary({
      summary: repaired,
      finishReason: repairExecution.response.finishReason,
      hasToolUses: getToolUses(repairExecution.response.message).length > 0,
      hasParseErrors: (repairExecution.response.parseIssues ?? []).some((issue) => issue.severity === "error"),
      sourceChars: value.length,
    });
    const repairOutcome: NonNullable<ModelInputDebug["outcome"]> = {
      status: repairErrors.length === 0 ? "accepted" : "rejected",
      compactionPass: pass,
      compactionStage: "repair",
      evidenceChars: summary.length,
      finishReason: repairExecution.response.finishReason,
      ...(usage(repairExecution.response) ? { usage: usage(repairExecution.response) } : {}),
      output: repaired,
      ...(repairErrors.length > 0 ? { validationErrors: repairErrors } : {}),
    };
    if (repairExecution.debugInputId) await input.onOutcome?.(repairExecution.debugInputId, repairOutcome);
    if (repairErrors.length === 0) return { summary: repaired, execution: repairExecution, outcome: repairOutcome };
    throw new CompactionPassError(
      `Compaction repair failed validation: ${repairErrors.join("; ")}`,
      repairExecution.response.finishReason === "length",
      repairExecution,
      repairOutcome,
    );
  };

  const summarizeAdaptive = async (
    value: string,
    stage: Exclude<CompactionStage, "repair">,
    depth = 0,
  ): Promise<ValidatedPass> => {
    const oversized = estimateCompactionTokens(value) > inputBudgetTokens;
    if (oversized) {
      if (depth >= 8 || estimateCompactionTokens(value) <= 2_000) {
        throw new Error("Compaction evidence could not be divided within the safe input budget.");
      }
      const [left, right] = splitInHalf(value);
      if (!left || !right) throw new Error("Compaction evidence could not be divided safely.");
      const leftSummary = await summarizeAdaptive(left, "segment", depth + 1);
      const rightSummary = await summarizeAdaptive(right, "segment", depth + 1);
      return summarizeAdaptive(
        combinedEvidence([leftSummary.summary, rightSummary.summary]),
        stage === "final" ? "final" : "merge",
        depth + 1,
      );
    }
    try {
      return await executeValidated(value, stage);
    } catch (error) {
      if (!(error instanceof CompactionPassError) || !error.lengthLimited || depth >= 8 || estimateCompactionTokens(value) <= 2_000) {
        throw error;
      }
      const [left, right] = splitInHalf(value);
      if (!left || !right) throw error;
      const leftSummary = await summarizeAdaptive(left, "segment", depth + 1);
      const rightSummary = await summarizeAdaptive(right, "segment", depth + 1);
      return summarizeAdaptive(
        combinedEvidence([leftSummary.summary, rightSummary.summary]),
        stage === "final" ? "final" : "merge",
        depth + 1,
      );
    }
  };

  const final = await summarizeAdaptive(evidence.text, "final");
  return {
    summary: final.summary,
    debugInputId: final.execution.debugInputId,
    outcome: final.outcome,
    evidence: {
      sourceChars: evidence.sourceChars,
      rawReasoningChars: evidence.rawReasoningChars,
      passes: pass,
    },
  };
}
