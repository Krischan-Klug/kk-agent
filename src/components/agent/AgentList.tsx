import styled from "styled-components";
import type { AgentDefinition, McpListItem } from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

const List = styled.div`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  overflow-y: auto;
`;

const Item = styled.div<{ $active: boolean }>`
  padding: var(--space-md);
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "var(--bg-elevated)")};
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
  }
`;

const Name = styled.div`
  font-weight: 600;
  margin-bottom: 2px;
`;

const Description = styled.div`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const Meta = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
`;

type Props = {
  agents: AgentDefinition[];
  mcps: McpListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export default function AgentList({ agents, mcps, selectedId, onSelect, onCreate }: Props) {
  return (
    <List>
      <Button size="sm" onClick={onCreate}>
        Neuer Agent
      </Button>
      {agents.map((agent) => {
        const capabilityIds = [
          ...new Set(
            Object.values(agent.modeConfigs ?? {})
              .flatMap((mode) => [...(mode?.toolIds ?? []), ...(mode?.mcpIds ?? [])]),
          ),
        ];
        return (
          <Item key={agent.id} $active={agent.id === selectedId} onClick={() => onSelect(agent.id)}>
            <Name>{agent.name}</Name>
            {agent.description && <Description>{agent.description}</Description>}
            <Meta>
              {capabilityIds.length > 0 && (
                <Badge variant="success">
                  {capabilityIds.map((id) => mcps.find((mcp) => mcp.id === id)?.emoji || "🛠️").join("")}
                </Badge>
              )}
            </Meta>
          </Item>
        );
      })}
    </List>
  );
}
