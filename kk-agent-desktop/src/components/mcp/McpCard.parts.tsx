import { useState } from "react";
import type { McpListItem } from "@/types/api";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import { ActionsRow, MutedText, SectionTitle } from "@/components/PageForm";
import type { EditForm } from "./types";
import McpJsonEditor from "./McpJsonEditor";
import { MCP_SSE_HINT, MCP_STDIO_HINT, parseMcpServerJson } from "./configJson";

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
  const parsedServer = parseMcpServerJson(editForm.serverJson, mcp.transport);
  const serverJsonError = !parsedServer.ok ? parsedServer.error : undefined;

  return (
    <McpJsonEditor
      value={editForm.serverJson}
      onChange={(serverJson) => onEditFormChange({ ...editForm, serverJson })}
      hint={mcp.transport === "stdio" ? MCP_STDIO_HINT : MCP_SSE_HINT}
      error={serverJsonError}
      rows={8}
      label={`Server JSON (${mcp.transport})`}
    />
  );
}
