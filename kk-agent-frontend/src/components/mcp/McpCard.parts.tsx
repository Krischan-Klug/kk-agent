import { useState } from "react";
import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import { Select } from "@/components/FormControls.styled";
import { ActionsRow, FieldLabel, FormField, MutedText, SectionTitle } from "@/components/PageForm";
import { useDropdown } from "@/hooks/useDropdown";
import type { EditForm } from "./types";

export const ConfigDetail = styled.div`
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: pre-wrap;
`;

const SkillPicker = styled.div`
  position: relative;
  margin-top: var(--space-sm);
`;

const SkillPickerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
    background: var(--bg-hover);
  }

  &::after {
    content: "▼";
    font-size: 8px;
    opacity: 0.7;
  }
`;

const SkillPickerMenu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: min(360px, 100%);
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
`;

const SkillOptionButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
`;

const SkillOptionLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SkillOptionMark = styled.span<{ $active: boolean }>`
  flex-shrink: 0;
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-muted)")};
`;

const LinkedSkillsPreview = styled.div`
  margin-top: var(--space-sm);
  max-height: 96px;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
`;

const LinkedSkillsPreviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const LinkedSkillsPreviewItem = styled.div`
  font-size: var(--font-size-sm);
  color: var(--text-primary);
`;

const LinkedSkillsEmpty = styled.div`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

type SkillOption = { id: string; name: string };

type LinkedSkillsPickerProps = {
  mcp: McpListItem;
  availableSkills?: SkillOption[];
  onSkillToggle?: (skillId: string, linked: boolean) => void;
};

export function LinkedSkillsPicker({ mcp, availableSkills, onSkillToggle }: LinkedSkillsPickerProps) {
  const skillDropdown = useDropdown<HTMLDivElement>();
  if (!availableSkills || availableSkills.length === 0 || !onSkillToggle) return null;

  const linkedSkillIds = mcp.skillIds ?? [];
  const linkedSkills = availableSkills.filter((skill) => linkedSkillIds.includes(skill.id));

  return (
    <div style={{ marginTop: "var(--space-md)" }}>
      <SectionTitle as="span">Linked Skills</SectionTitle>
      <MutedText>
        Skills linked here are automatically added to the skill catalog of any session that uses this{" "}
        {mcp.source === "system" ? "tool" : "MCP"}.
      </MutedText>
      <SkillPicker ref={skillDropdown.ref}>
        <SkillPickerButton type="button" onClick={skillDropdown.toggle}>
          Select skills ({linkedSkills.length})
        </SkillPickerButton>
        {skillDropdown.open && (
          <SkillPickerMenu>
            {availableSkills.map((skill) => {
              const linked = linkedSkillIds.includes(skill.id);
              return (
                <SkillOptionButton
                  key={skill.id}
                  type="button"
                  $active={linked}
                  onClick={() => onSkillToggle(skill.id, !linked)}
                >
                  <SkillOptionLabel title={skill.name}>{skill.name}</SkillOptionLabel>
                  <SkillOptionMark $active={linked}>{linked ? "✓" : "+"}</SkillOptionMark>
                </SkillOptionButton>
              );
            })}
          </SkillPickerMenu>
        )}
      </SkillPicker>
      <LinkedSkillsPreview>
        {linkedSkills.length > 0 ? (
          <LinkedSkillsPreviewList>
            {linkedSkills.map((skill) => (
              <LinkedSkillsPreviewItem key={skill.id}>{skill.name}</LinkedSkillsPreviewItem>
            ))}
          </LinkedSkillsPreviewList>
        ) : (
          <LinkedSkillsEmpty>No skills linked.</LinkedSkillsEmpty>
        )}
      </LinkedSkillsPreview>
    </div>
  );
}

type SystemVariablesToggleProps = {
  systemVariables: string[];
};

export function SystemVariablesToggle({ systemVariables }: SystemVariablesToggleProps) {
  const [showSystemVariables, setShowSystemVariables] = useState(false);
  if (systemVariables.length === 0) return null;

  return (
    <>
      <ActionsRow style={{ marginTop: "var(--space-md)" }}>
        <Button size="sm" variant="secondary" type="button" onClick={() => setShowSystemVariables((prev) => !prev)}>
          {showSystemVariables ? "Hide system variables" : "Show system variables"}
        </Button>
      </ActionsRow>
      {showSystemVariables && <MutedText>{systemVariables.join(", ")}</MutedText>}
    </>
  );
}

type InstructionEditorBlockProps = {
  mcp: McpListItem;
  instruction: string;
  systemVariables: string[];
  availableSkills?: SkillOption[];
  title?: string;
  rows?: number;
  onInstructionChange: (value: string) => void;
  onSkillToggle?: (skillId: string, linked: boolean) => void;
};

export function InstructionEditorBlock({
  mcp,
  instruction,
  systemVariables,
  availableSkills,
  title,
  rows = 14,
  onInstructionChange,
  onSkillToggle,
}: InstructionEditorBlockProps) {
  return (
    <>
      <SystemVariablesToggle systemVariables={systemVariables} />
      {title && <SectionTitle style={{ marginTop: "var(--space-md)" }}>{title}</SectionTitle>}
      <TextArea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        rows={rows}
        style={{ marginTop: "var(--space-sm)" }}
      />
      <LinkedSkillsPicker mcp={mcp} availableSkills={availableSkills} onSkillToggle={onSkillToggle} />
    </>
  );
}

type McpEditFieldsProps = {
  mcp: McpListItem;
  editForm: EditForm;
  onEditFormChange: (form: EditForm) => void;
};

export function McpEditFields({ mcp, editForm, onEditFormChange }: McpEditFieldsProps) {
  return (
    <>
      {mcp.source === "system" ? (
        <>
          {mcp.systemKey === "filesystem" && (
            <>
              <FormField>
                <FieldLabel>Access Scope</FieldLabel>
                <Select
                  value={editForm.accessScope}
                  onChange={(e) => onEditFormChange({ ...editForm, accessScope: e.target.value as "user" | "system", basePath: "" })}
                >
                  <option value="user">user</option>
                  <option value="system">system</option>
                </Select>
              </FormField>
              <FormField>
                <FieldLabel>Base Path</FieldLabel>
                <Input
                  value={editForm.basePath}
                  placeholder="Leave empty for automatic scope default"
                  onChange={(e) => onEditFormChange({ ...editForm, basePath: e.target.value })}
                />
              </FormField>
            </>
          )}
          {mcp.systemKey === "terminal" && (
            <>
              <FormField>
                <FieldLabel>Access Scope</FieldLabel>
                <Select
                  value={editForm.accessScope}
                  onChange={(e) => onEditFormChange({ ...editForm, accessScope: e.target.value as "user" | "system", workingDirectory: "" })}
                >
                  <option value="user">user</option>
                  <option value="system">system</option>
                </Select>
              </FormField>
              <FormField>
                <FieldLabel>Working Directory</FieldLabel>
                <Input
                  value={editForm.workingDirectory}
                  placeholder="Leave empty for automatic scope default"
                  onChange={(e) => onEditFormChange({ ...editForm, workingDirectory: e.target.value })}
                />
              </FormField>
              <ConfigDetail>
                {editForm.accessScope === "system"
                  ? "system allows system-wide terminal access with elevated execution."
                  : "user allows only terminal access within the current user scope."}
              </ConfigDetail>
            </>
          )}
          {(mcp.systemKey === "filesystem" || mcp.systemKey === "terminal" || mcp.systemKey === "web-search") && (
            <>
              <FormField>
                <FieldLabel>Preview Threshold (chars)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={editForm.previewThresholdChars}
                  placeholder="Leave empty for tool default"
                  onChange={(e) => onEditFormChange({ ...editForm, previewThresholdChars: e.target.value })}
                />
              </FormField>
              <FormField>
                <FieldLabel>Preview Chars</FieldLabel>
                <Input
                  type="number"
                  min={200}
                  value={editForm.previewChars}
                  placeholder="Leave empty for tool default"
                  onChange={(e) => onEditFormChange({ ...editForm, previewChars: e.target.value })}
                />
              </FormField>
            </>
          )}
        </>
      ) : mcp.transport === "stdio" ? (
        <>
          <FormField>
            <FieldLabel>Command</FieldLabel>
            <Input value={editForm.command} onChange={(e) => onEditFormChange({ ...editForm, command: e.target.value })} />
          </FormField>
          <FormField>
            <FieldLabel>Args (one argument per line)</FieldLabel>
            <TextArea value={editForm.args} onChange={(e) => onEditFormChange({ ...editForm, args: e.target.value })} rows={4} />
          </FormField>
        </>
      ) : (
        <FormField>
          <FieldLabel>URL</FieldLabel>
          <Input value={editForm.url} onChange={(e) => onEditFormChange({ ...editForm, url: e.target.value })} />
        </FormField>
      )}
    </>
  );
}
