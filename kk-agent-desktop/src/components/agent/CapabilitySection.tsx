import TextArea from "@/components/TextArea";
import {
  CapabilityHeader,
  CheckboxRow,
  ExpandButton,
  HeaderActions,
  IconActionButton,
  NestedToolCard,
  NestedToolList,
  OverrideMark,
  StatusDot,
  ToolDescription,
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
  emoji: string;
  name: string;
  running?: boolean;
  showDetails?: boolean;
  detailsOpen?: boolean;
  detailsOpenLabel?: string;
  detailsClosedLabel?: string;
  instructionOpen?: boolean;
  customized?: boolean;
  onToggle: () => void;
  onToggleDetails?: () => void;
  onToggleInstruction?: () => void;
  onResetInstruction?: () => void;
};

export function CapabilityToggleHeader({
  active,
  emoji,
  name,
  running,
  showDetails,
  detailsOpen,
  detailsOpenLabel = "Less",
  detailsClosedLabel = "Details",
  instructionOpen,
  customized,
  onToggle,
  onToggleDetails,
  onToggleInstruction,
  onResetInstruction,
}: CapabilityToggleHeaderProps) {
  return (
    <CapabilityHeader>
      <CheckboxRow>
        <input type="checkbox" checked={active} onChange={onToggle} />
        <span style={{ fontSize: "1.1em" }}>{emoji}</span>
        <span style={{ fontWeight: 500 }}>{name}</span>
        {running !== undefined && <StatusDot $running={running} />}
      </CheckboxRow>
      {active && (
        <HeaderActions>
          {showDetails && onToggleDetails && (
            <ExpandButton type="button" onClick={onToggleDetails}>
              {detailsOpen ? detailsOpenLabel : detailsClosedLabel}
            </ExpandButton>
          )}
          {onToggleInstruction && (
            <ExpandButton type="button" onClick={onToggleInstruction}>
              {instructionOpen ? "Hide instruction" : "Show instruction"}
            </ExpandButton>
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
  allowedToolNames: string[];
  onToggleTool: (toolName: string, allowed: boolean) => void;
};

export function NestedCapabilityToolList({ tools, allowedToolNames, onToggleTool }: NestedCapabilityToolListProps) {
  return (
    <NestedToolList>
      {tools.map((tool) => {
        const allowed = allowedToolNames.includes(tool.name);
        return (
          <NestedToolCard key={tool.name} $active={allowed}>
            <CheckboxRow>
              <input
                type="checkbox"
                checked={allowed}
                onChange={() => onToggleTool(tool.name, allowed)}
              />
              <ToolName>{tool.name}</ToolName>
            </CheckboxRow>
            <ToolDescription>{tool.description}</ToolDescription>
          </NestedToolCard>
        );
      })}
    </NestedToolList>
  );
}
