import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import { useDropdown } from "@/hooks/useDropdown";
import Toggle from "./Toggle";

const Wrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const Trigger = styled.button<{ $warn?: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  background: ${(p) => (p.$warn ? "rgba(255, 160, 50, 0.12)" : "var(--accent-muted)")};
  color: ${(p) => (p.$warn ? "var(--warning)" : "var(--accent)")};
  border: 1px solid ${(p) => (p.$warn ? "var(--warning)" : "var(--accent)")};
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: ${(p) => (p.$warn ? "var(--warning)" : "var(--accent)")};
    color: var(--bg-base);
  }

  &::after {
    content: "▼";
    font-size: 8px;
    opacity: 0.7;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  min-width: 240px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: var(--space-xs) 0;
`;

const McpRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--text-primary);

  &:hover {
    background: var(--bg-hover);
  }
`;

const McpLabelGroup = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  overflow: hidden;
`;

const McpEmoji = styled.span`
  flex-shrink: 0;
  line-height: 1;
`;

const StatusDot = styled.span<{ $running: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => (p.$running ? "var(--success)" : "var(--danger)")};
  flex-shrink: 0;
`;

const McpLabel = styled.span<{ $stopped?: boolean }>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: ${(p) => (p.$stopped ? 0.5 : 1)};
`;

const EmptyHint = styled.div`
  padding: var(--space-sm) var(--space-md);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
`;

interface McpSelectProps {
  mcps: McpListItem[];
  activeMcpIds: string[];
  onToggle: (mcpId: string, enabled: boolean) => void;
  label?: string;
  emptyHint?: string;
}

export default function McpSelect({
  mcps,
  activeMcpIds,
  onToggle,
  label = "MCPs",
  emptyHint = "Keine MCP Server konfiguriert",
}: McpSelectProps) {
  const { open, ref, toggle } = useDropdown<HTMLDivElement>();

  const activeCount = mcps.filter((m) => activeMcpIds.includes(m.id)).length;
  const hasUnavailable = mcps.some((m) => !m.running && activeMcpIds.includes(m.id));

  return (
    <Wrapper ref={ref}>
      <Trigger $warn={hasUnavailable} onClick={toggle}>
        {label} ({activeCount})
      </Trigger>
      {open && (
        <Dropdown>
          {mcps.length === 0 ? (
            <EmptyHint>{emptyHint}</EmptyHint>
          ) : (
            mcps.map((m) => (
              <McpRow key={m.id}>
                <McpLabelGroup>
                  <StatusDot $running={m.running} />
                  <McpEmoji>{m.emoji || (m.source === "system" ? "🛠️" : "🔌")}</McpEmoji>
                  <McpLabel $stopped={!m.running}>
                    {m.name}
                  </McpLabel>
                </McpLabelGroup>
                <Toggle
                  checked={activeMcpIds.includes(m.id)}
                  onChange={(checked) => onToggle(m.id, checked)}
                  disabled={!m.running}
                />
              </McpRow>
            ))
          )}
        </Dropdown>
      )}
    </Wrapper>
  );
}
