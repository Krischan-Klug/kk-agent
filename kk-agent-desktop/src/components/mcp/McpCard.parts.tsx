import { useState } from "react";
import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import { Select } from "@/components/FormControls.styled";
import { ActionsRow, FieldLabel, FormField, MutedText, SectionTitle } from "@/components/PageForm";
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

type SystemVariablesToggleProps = {
  systemVariables: string[];
};

function SystemVariablesToggle({ systemVariables }: SystemVariablesToggleProps) {
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
  instruction: string;
  systemVariables: string[];
  title?: string;
  rows?: number;
  onInstructionChange: (value: string) => void;
};

export function InstructionEditorBlock({
  instruction,
  systemVariables,
  title,
  rows = 14,
  onInstructionChange,
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
