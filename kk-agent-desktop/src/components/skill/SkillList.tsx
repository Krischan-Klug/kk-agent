import Badge from "@/components/Badge";
import {
  SidebarItem,
  SidebarItemDescription,
  SidebarItemTitle,
  SidebarList,
  SidebarMeta,
} from "@/components/MasterDetail.styled";
import type { SkillDefinition } from "kk-agent-contract";

type Props = {
  skills: SkillDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function SkillList({
  skills,
  selectedId,
  onSelect,
}: Props) {
  return (
    <SidebarList>
      {skills.map((skill) => (
        <SidebarItem key={skill.id} type="button" $active={skill.id === selectedId} onClick={() => onSelect(skill.id)}>
          <SidebarItemTitle>{skill.name}</SidebarItemTitle>
          <SidebarItemDescription>{skill.description}</SidebarItemDescription>
          <SidebarMeta>
            <Badge variant="info">{skill.source}</Badge>
            {skill.resources.length > 0 && <Badge>{skill.resources.length} resources</Badge>}
          </SidebarMeta>
        </SidebarItem>
      ))}
    </SidebarList>
  );
}
