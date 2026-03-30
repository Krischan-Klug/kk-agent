import styled from "styled-components";
import type { McpListItem, SessionState } from "@/types/api";
import Badge from "@/components/Badge";
import ModelSelect from "@/components/ModelSelect";
import McpSelect from "@/components/McpSelect";

export type ChatDebugTab = "prompt" | "tools" | "session" | "messages";

const DebugPanel = styled.div`
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  margin-bottom: var(--space-md);
  overflow: hidden;
  flex-shrink: 0;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
`;

const DebugTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
`;

const DebugTab = styled.button<{ $active?: boolean }>`
  background: ${({ $active }) => ($active ? "var(--bg-surface)" : "none")};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--accent)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--text-primary)" : "var(--text-muted)")};
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  font-family: var(--font-mono);

  &:hover {
    color: var(--text-primary);
  }
`;

const DebugControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  margin-left: auto;
`;

const DebugContent = styled.pre`
  margin: 0;
  padding: var(--space-md);
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  flex: 1;
`;

type Props = {
  open: boolean;
  debugTab: ChatDebugTab;
  onTabChange: (tab: ChatDebugTab) => void;
  session: SessionState | null;
  debugPrompt: string | null;
  debugTools: McpListItem[];
  models: string[];
  mcps: McpListItem[];
  onModelSwitch: (model: string) => void;
  onMcpToggle: (mcpId: string, enabled: boolean) => void;
};

export default function ChatDebugPanel({
  open,
  debugTab,
  onTabChange,
  session,
  debugPrompt,
  debugTools,
  models,
  mcps,
  onModelSwitch,
  onMcpToggle,
}: Props) {
  if (!open || !session) return null;

  let content = "";

  if (debugTab === "prompt") {
    content = debugPrompt ?? "Lade...";
  } else if (debugTab === "tools") {
    const activeTools = debugTools.filter((m) => session.activeMcpIds.includes(m.id));
    if (activeTools.length === 0) {
      content = "Keine aktiven Tools.";
    } else {
      content = activeTools
        .map((m) => {
          const header = `-- ${m.emoji || "Tool"} ${m.name} (${m.id}) --`;
          const tools = m.tools.map((t) => {
            const params = t.inputSchema?.properties
              ? Object.entries(t.inputSchema.properties as Record<string, { type?: string; description?: string }>)
                  .map(([k, v]) => `    ${k}: ${v.type ?? "any"} - ${v.description ?? ""}`)
                  .join("\n")
              : "    (keine Parameter)";
            return `  ${t.name}\n    ${t.description ?? ""}\n${params}`;
          });
          return `${header}\n${tools.join("\n\n")}`;
        })
        .join("\n\n");
    }
  } else if (debugTab === "session") {
    content = JSON.stringify(
      {
        id: session.id,
        name: session.name,
        model: session.model,
        agentId: session.agentId,
        activeMcpIds: session.activeMcpIds,
        reasoningEffort: session.reasoningEffort ?? "default",
        temperature: session.temperature ?? "default",
        messageCount: session.messages.length,
        createdAt: session.createdAt,
      },
      null,
      2,
    );
  } else if (debugTab === "messages") {
    const msgs = session.messages.slice(-10);
    content = msgs
      .map((m, i) => {
        const idx = session.messages.length - msgs.length + i;
        const role = m.role.toUpperCase();
        const preview = m.content?.slice(0, 300) || "(leer)";
        const toolInfo = m.tool_calls?.length ? `\n  tool_calls: [${m.tool_calls.map((tc) => tc.name).join(", ")}]` : "";
        const toolId = m.tool_call_id ? `\n  tool_call_id: ${m.tool_call_id}` : "";
        return `[${idx}] ${role}${toolInfo}${toolId}\n  ${preview}${(m.content?.length ?? 0) > 300 ? "..." : ""}`;
      })
      .join("\n\n");
  }

  return (
    <DebugPanel>
      <DebugTabs>
        <DebugTab $active={debugTab === "prompt"} onClick={() => onTabChange("prompt")}>System Prompt</DebugTab>
        <DebugTab $active={debugTab === "tools"} onClick={() => onTabChange("tools")}>Tools</DebugTab>
        <DebugTab $active={debugTab === "session"} onClick={() => onTabChange("session")}>Session</DebugTab>
        <DebugTab $active={debugTab === "messages"} onClick={() => onTabChange("messages")}>Messages</DebugTab>
        <DebugControls>
          {models.length > 0 ? (
            <ModelSelect models={models} currentModel={session.model} onSelect={onModelSwitch} />
          ) : (
            <Badge variant="info">{session.model}</Badge>
          )}
          <McpSelect mcps={mcps} activeMcpIds={session.activeMcpIds} onToggle={onMcpToggle} />
        </DebugControls>
      </DebugTabs>
      <DebugContent>{content}</DebugContent>
    </DebugPanel>
  );
}
