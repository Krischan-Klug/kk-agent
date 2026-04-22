import type { AgentDefinition, McpListItem } from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import {
  SidebarItem,
  SidebarItemDescription,
  SidebarItemTitle,
  SidebarList,
  SidebarMeta,
} from "@/components/MasterDetail.styled";

type Props = {
  agents: AgentDefinition[];
  mcps: McpListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export default function AgentList({ agents, mcps, selectedId, onSelect, onCreate }: Props) {
  return (
    <SidebarList>
      <Button size="sm" onClick={onCreate}>
        Neuer Agent
      </Button>
      {agents.map((agent) => {
        const capabilityIds = [
          ...new Set(
            (agent.modes ?? [])
              .flatMap((mode) => [...(mode.config.toolIds ?? []), ...(mode.config.mcpIds ?? [])]),
          ),
        ];
        return (
          <SidebarItem key={agent.id} type="button" $active={agent.id === selectedId} onClick={() => onSelect(agent.id)}>
            <SidebarItemTitle>{agent.name}</SidebarItemTitle>
            {agent.description && <SidebarItemDescription>{agent.description}</SidebarItemDescription>}
            <SidebarMeta>
              {capabilityIds.length > 0 && (
                <Badge variant="success">
                  {capabilityIds.map((id) => mcps.find((mcp) => mcp.id === id)?.emoji || "ðŸ› ï¸").join("")}
                </Badge>
              )}
            </SidebarMeta>
          </SidebarItem>
        );
      })}
    </SidebarList>
  );
}
