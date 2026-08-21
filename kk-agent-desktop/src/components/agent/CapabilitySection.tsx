import TextArea from "@/components/TextArea";
import type { ReactNode } from "react";
import {
  CapabilityHeader,
  CapabilityIdentity,
  CapabilityToggle,
  ExpandButton,
  HeaderActions,
  IconActionButton,
  NestedToolCard,
  NestedToolList,
  OverrideMark,
  StatusDot,
  ToolName,
} from "./AgentEditor.styled";
import { OVERRIDE_EMOJI, RESET_EMOJI } from "./AgentEditor.helpers";

type OverrideActionsProps = {
  onReset: () => void;
};

export function OverrideActions({ onReset }: OverrideActionsProps) {
  return (
    <>
      <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
      <IconActionButton
        type="button"
        title="Reset to default"
        onClick={onReset}
      >
        {RESET_EMOJI}
      </IconActionButton>
    </>
  );
}

type CapabilityToggleHeaderProps = {
  active: boolean;
  icon: ReactNode;
  name: string;
  running?: boolean;
  expanded?: boolean;
  customized?: boolean;
  onToggle: () => void;
  onToggleExpanded?: () => void;
  onResetInstruction?: () => void;
};

export function CapabilityToggleHeader({
  active,
  icon,
  name,
  running,
  expanded,
  customized,
  onToggle,
  onToggleExpanded,
  onResetInstruction,
}: CapabilityToggleHeaderProps) {
  return (
    <CapabilityHeader>
      <CapabilityIdentity>
        <CapabilityToggle
          type="button"
          $active={active}
          role="switch"
          aria-checked={active}
          aria-label={`${name} ${active ? "deaktivieren" : "aktivieren"}`}
          onClick={onToggle}
        />
        <span style={{ fontSize: "1.1em", lineHeight: 1, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontWeight: 500 }}>{name}</span>
        {running !== undefined && <StatusDot $running={running} />}
      </CapabilityIdentity>
      {active && (
        <HeaderActions>
          {onToggleExpanded && (
            <ExpandButton
              type="button"
              $expanded={expanded}
              aria-expanded={expanded}
              aria-label={expanded ? `${name} einklappen` : `${name} aufklappen`}
              title={expanded ? "Einklappen" : "Aufklappen"}
              onClick={onToggleExpanded}
            />
          )}
          {customized && onResetInstruction && (
            <OverrideActions onReset={onResetInstruction} />
          )}
        </HeaderActions>
      )}
    </CapabilityHeader>
  );
}

type CapabilityInstructionEditorProps = {
  value: string;
  rows: number;
  onChange: (value: string) => void;
};

export function CapabilityInstructionEditor({ value, rows, onChange }: CapabilityInstructionEditorProps) {
  return (
    <TextArea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

type NestedCapabilityTool = {
  name: string;
  description: string;
};

type NestedCapabilityToolListProps = {
  tools: NestedCapabilityTool[];
  activeToolNames: string[];
  onToggleTool: (toolName: string) => void;
};

export function NestedCapabilityToolList({
  tools,
  activeToolNames,
  onToggleTool,
}: NestedCapabilityToolListProps) {
  const activeNames = new Set(activeToolNames);

  return (
    <NestedToolList>
      {tools.map((tool) => {
        const active = activeNames.has(tool.name);
        return (
          <NestedToolCard key={tool.name} $active title={tool.description}>
            <CapabilityToggle
              type="button"
              $active={active}
              role="switch"
              aria-checked={active}
              aria-label={`${tool.name} ${active ? "deaktivieren" : "aktivieren"}`}
              onClick={() => onToggleTool(tool.name)}
            />
            <ToolName>{tool.name}</ToolName>
          </NestedToolCard>
        );
      })}
    </NestedToolList>
  );
}
