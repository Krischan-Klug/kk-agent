import Badge from "@/components/Badge";
import Button from "@/components/Button";
import {
  SidebarItem,
  SidebarItemDescription,
  SidebarItemTitle,
  SidebarList,
  SidebarMeta,
} from "@/components/MasterDetail.styled";
import type { SkillDefinition } from "@/types/api";

export type SkillUsage = {
  tools: string[];
  mcps: string[];
};

type Props = {
  skills: SkillDefinition[];
  selectedId: string | null;
  createDraftName?: string;
  usageBySkillId: Map<string, SkillUsage>;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

function getUsageCount(usage?: SkillUsage): number {
  if (!usage) return 0;
  return usage.tools.length + usage.mcps.length;
}

export default function SkillList({
  skills,
  selectedId,
  createDraftName,
  usageBySkillId,
  onSelect,
  onCreate,
}: Props) {
  return (
    <SidebarList>
      <Button size="sm" onClick={onCreate}>
        New skill
      </Button>

      {createDraftName !== undefined && (
        <SidebarItem type="button" $active={selectedId === null}>
          <SidebarItemTitle>{createDraftName.trim() || "New skill"}</SidebarItemTitle>
          <SidebarItemDescription>Not saved yet.</SidebarItemDescription>
          <SidebarMeta>
            <Badge variant="info">New</Badge>
          </SidebarMeta>
        </SidebarItem>
      )}

      {skills.map((skill) => {
        const usage = usageBySkillId.get(skill.id);
        const usageCount = getUsageCount(usage);

        return (
          <SidebarItem key={skill.id} type="button" $active={skill.id === selectedId} onClick={() => onSelect(skill.id)}>
            <SidebarItemTitle>{skill.name}</SidebarItemTitle>
            <SidebarItemDescription>{skill.description}</SidebarItemDescription>
            <SidebarMeta>
              {usageCount > 0 && <Badge variant="info">{usageCount} Link{usageCount === 1 ? "" : "en"}</Badge>}
            </SidebarMeta>
          </SidebarItem>
        );
      })}
    </SidebarList>
  );
}
