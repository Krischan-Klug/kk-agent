import type { AgentDefinition } from "@/types/api";
import SelectMenu from "@/components/SelectMenu";

interface AgentSelectProps {
  agents: AgentDefinition[];
  currentAgentId: string;
  onSelect: (agentId: string) => void;
  direction?: "up" | "down";
}

export default function AgentSelect({ agents, currentAgentId, onSelect, direction = "down" }: AgentSelectProps) {
  return (
    <SelectMenu
      value={currentAgentId}
      direction={direction}
      minWidth="220px"
      options={agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        description: agent.description || undefined,
      }))}
      onSelect={onSelect}
    />
  );
}
