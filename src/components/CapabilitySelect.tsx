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

const CapabilityRow = styled.div`
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

const CapabilityLabelGroup = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  overflow: hidden;
`;

const CapabilityEmoji = styled.span`
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

const CapabilityLabel = styled.span<{ $stopped?: boolean }>`
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

type Props = {
  items: McpListItem[];
  activeIds: string[];
  onToggle: (id: string, enabled: boolean) => void;
  label?: string;
  emptyHint?: string;
};

export default function CapabilitySelect({
  items,
  activeIds,
  onToggle,
  label = "Capabilities",
  emptyHint = "Keine Eintraege konfiguriert",
}: Props) {
  const { open, ref, toggle } = useDropdown<HTMLDivElement>();

  const activeCount = items.filter((item) => activeIds.includes(item.id)).length;
  const hasUnavailable = items.some((item) => !item.running && activeIds.includes(item.id));

  return (
    <Wrapper ref={ref}>
      <Trigger $warn={hasUnavailable} onClick={toggle}>
        {label} ({activeCount})
      </Trigger>
      {open && (
        <Dropdown>
          {items.length === 0 ? (
            <EmptyHint>{emptyHint}</EmptyHint>
          ) : (
            items.map((item) => (
              <CapabilityRow key={item.id}>
                <CapabilityLabelGroup>
                  <StatusDot $running={item.running} />
                  <CapabilityEmoji>{item.emoji || (item.source === "system" ? "🛠️" : "🔌")}</CapabilityEmoji>
                  <CapabilityLabel $stopped={!item.running}>{item.name}</CapabilityLabel>
                </CapabilityLabelGroup>
                <Toggle
                  checked={activeIds.includes(item.id)}
                  onChange={(checked) => onToggle(item.id, checked)}
                  disabled={!item.running}
                />
              </CapabilityRow>
            ))
          )}
        </Dropdown>
      )}
    </Wrapper>
  );
}
