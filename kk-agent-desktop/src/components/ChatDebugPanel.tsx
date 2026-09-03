import styled from "styled-components";
import type {
  AgentLoopState,
  HarnessInstructionDebug,
  ModelInputDebug,
  RunEvent,
  SessionPromptDebug,
  SessionState,
} from "kk-agent-contract";

export type ChatDebugTab = "model-input" | "prompt" | "runtime" | "harness" | "runs" | "session";

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  max-height: 50vh;
  margin-bottom: var(--space-md);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: var(--space-xs) var(--space-md);
  border: 0;
  border-bottom: 2px solid ${({ $active }) => $active ? "var(--accent)" : "transparent"};
  background: ${({ $active }) => $active ? "var(--bg-surface)" : "transparent"};
  color: ${({ $active }) => $active ? "var(--text-primary)" : "var(--text-muted)"};
  font: inherit;
  cursor: pointer;
`;

const Content = styled.pre`
  flex: 1;
  margin: 0;
  padding: var(--space-md);
  overflow: auto;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

type Props = {
  open: boolean;
  tab: ChatDebugTab;
  onTabChange: (tab: ChatDebugTab) => void;
  session: SessionState;
  loopState: AgentLoopState | null;
  streamRunEvents: RunEvent[];
  debug: SessionPromptDebug | null;
};

const tabs: Array<{ id: ChatDebugTab; label: string }> = [
  { id: "model-input", label: "Model input" },
  { id: "prompt", label: "Prompt" },
  { id: "runtime", label: "Runtime" },
  { id: "harness", label: "Harness" },
  { id: "runs", label: "Runs" },
  { id: "session", label: "Session" },
];

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderContent(tab: ChatDebugTab, session: SessionState, loopState: AgentLoopState | null, events: RunEvent[], debug: SessionPromptDebug | null): string {
  if (tab === "model-input") return json(debug?.modelInputs ?? [] satisfies ModelInputDebug[]);
  if (tab === "prompt") return [debug?.systemPrompt, debug?.runtimeContext].filter(Boolean).join("\n\n");
  if (tab === "runtime") return json({
    tools: debug?.runtimeTools ?? [],
    mcps: debug?.runtimeMcps ?? [],
    skills: debug?.runtimeSkills ?? [],
    diagnostics: debug?.runtimeDiagnostics ?? {},
  });
  if (tab === "harness") return json(debug?.harnessInstructions ?? [] satisfies HarnessInstructionDebug[]);
  if (tab === "runs") return json({ loopState, events, runs: session.runs });
  return json(session);
}

export default function ChatDebugPanel({ open, tab, onTabChange, session, loopState, streamRunEvents, debug }: Props) {
  if (!open) return null;
  return (
    <Panel aria-label="Chat debug information">
      <Tabs role="tablist">
        {tabs.map((item) => (
          <Tab key={item.id} type="button" role="tab" aria-selected={tab === item.id} $active={tab === item.id} onClick={() => onTabChange(item.id)}>
            {item.label}
          </Tab>
        ))}
      </Tabs>
      <Content>{renderContent(tab, session, loopState, streamRunEvents, debug) || "No debug data."}</Content>
    </Panel>
  );
}
