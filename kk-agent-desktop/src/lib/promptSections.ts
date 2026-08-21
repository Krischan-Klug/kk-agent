import type { AgentPromptSections } from "@/types/api";

export const PROMPT_SECTION_META: Array<{ key: keyof AgentPromptSections; label: string }> = [
  { key: "identity", label: "\u{1FAAA} Identity" },
  { key: "system", label: "\u{1F9E0} System" },
  { key: "runtime", label: "\u2699\uFE0F Runtime" },
  { key: "security", label: "\u{1F512} Security" },
  { key: "toolUsage", label: "\u{1F6E0}\uFE0F Tool Usage" },
  { key: "communication", label: "\u{1F4AC} Communication" },
];
