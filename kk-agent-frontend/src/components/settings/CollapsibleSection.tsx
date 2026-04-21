import type { ReactNode } from "react";
import {
  SectionCardWrapper,
  SectionTitle,
  SectionToggle,
  SectionToggleMeta,
} from "@/components/settings/defaults.styled";

interface Props {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function CollapsibleSection({ title, expanded, onToggle, children }: Props) {
  return (
    <SectionCardWrapper>
      <SectionToggle type="button" onClick={onToggle}>
        <SectionTitle>{title}</SectionTitle>
        <SectionToggleMeta>{expanded ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
      </SectionToggle>
      {expanded && children}
    </SectionCardWrapper>
  );
}
