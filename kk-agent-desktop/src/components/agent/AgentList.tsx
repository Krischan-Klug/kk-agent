import type { AgentDefinition, McpListItem } from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import SkillIcon from "@/components/SkillIcon";
import {
  SidebarItem,
  SidebarItemDescription,
  SidebarItemTitle,
  SidebarList,
  SidebarMeta,
} from "@/components/MasterDetail.styled";

type Props = {
  agents: AgentDefinition[];
  tools: McpListItem[];
  mcps: McpListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export default function AgentList({ agents, tools, mcps, selectedId, onSelect, onCreate }: Props) {
  return (
    <SidebarList>
      <Button size="sm" onClick={onCreate}>
        New Agent
      </Button>
      {agents.map((agent) => {
        const toolIds = [...new Set((agent.modes ?? []).flatMap((mode) => mode.config.toolIds ?? []))];
        const mcpIds = [...new Set((agent.modes ?? []).flatMap((mode) => mode.config.mcpIds ?? []))];
        return (
          <SidebarItem key={agent.id} type="button" $active={agent.id === selectedId} onClick={() => onSelect(agent.id)}>
            <SidebarItemTitle>{agent.name}</SidebarItemTitle>
            {agent.description && <SidebarItemDescription>{agent.description}</SidebarItemDescription>}
            <SidebarMeta>
              {toolIds.length > 0 && (
                <Badge variant="success">
                  {toolIds.map((id) => (
                    id === "skill"
                      ? <SkillIcon key={id} />
                      : <span key={id}>{tools.find((tool) => tool.id === id)?.emoji || "T"}</span>
                  ))}
                </Badge>
              )}
              {mcpIds.length > 0 && (
                <Badge variant="warning">
                  {mcpIds.map((id) => <span key={id}>{mcps.find((mcp) => mcp.id === id)?.emoji || "M"}</span>)}
                </Badge>
              )}
            </SidebarMeta>
          </SidebarItem>
        );
      })}
    </SidebarList>
  );
}
