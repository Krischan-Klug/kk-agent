export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type ReasoningHistory = "auto" | "discard" | "latest" | "tool-turns" | "all";
export type ResolvedReasoningHistory = Exclude<ReasoningHistory, "auto">;
