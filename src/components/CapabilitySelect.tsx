import styled from "styled-components";
import { useDropdown } from "@/hooks/useDropdown";
import Toggle from "./Toggle";

const SKILL_EMOJI = "\u{1F4DA}";
const SYSTEM_CAPABILITY_EMOJI = "\u{1F6E0}\uFE0F";
const CUSTOM_CAPABILITY_EMOJI = "\u{1F50C}";
const DROPDOWN_CARET = "\u25BE";

type CapabilityItem = {
  id: string;
  name: string;
  emoji?: string;
  source?: "system" | "custom";
  running?: boolean;
  active?: boolean;
};

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
    content: "${DROPDOWN_CARET}";
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

const StatusDot = styled.span<{ $available: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => (p.$available ? "var(--success)" : "var(--danger)")};
  flex-shrink: 0;
`;

const CapabilityLabel = styled.span<{ $unavailable?: boolean }>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: ${(p) => (p.$unavailable ? 0.5 : 1)};
`;

const EmptyHint = styled.div`
  padding: var(--space-sm) var(--space-md);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
`;

type Props = {
  items: CapabilityItem[];
  activeIds: string[];
  onToggle: (id: string, enabled: boolean) => void;
  kind?: "tool" | "mcp" | "skill";
  label?: string;
  emptyHint?: string;
};

function isAvailable(item: CapabilityItem): boolean {
  return item.running !== false && item.active !== false;
}

function getCapabilityEmoji(item: CapabilityItem, kind: Props["kind"]): string {
  if (item.emoji) return item.emoji;
  if (kind === "skill") return SKILL_EMOJI;
  return item.source === "system" ? SYSTEM_CAPABILITY_EMOJI : CUSTOM_CAPABILITY_EMOJI;
}

export default function CapabilitySelect({
  items,
  activeIds,
  onToggle,
  kind = "mcp",
  label = "Capabilities",
  emptyHint = "Keine Eintraege konfiguriert",
}: Props) {
  const { open, ref, toggle } = useDropdown<HTMLDivElement>();

  const activeCount = items.filter((item) => activeIds.includes(item.id)).length;
  const hasUnavailable = items.some((item) => !isAvailable(item) && activeIds.includes(item.id));

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
            items.map((item) => {
              const available = isAvailable(item);
              return (
                <CapabilityRow key={item.id}>
                  <CapabilityLabelGroup>
                    <StatusDot $available={available} />
                    <CapabilityEmoji>{getCapabilityEmoji(item, kind)}</CapabilityEmoji>
                    <CapabilityLabel $unavailable={!available}>{item.name}</CapabilityLabel>
                  </CapabilityLabelGroup>
                  <Toggle
                    checked={activeIds.includes(item.id)}
                    onChange={(checked) => onToggle(item.id, checked)}
                    disabled={!available}
                  />
                </CapabilityRow>
              );
            })
          )}
        </Dropdown>
      )}
    </Wrapper>
  );
}
