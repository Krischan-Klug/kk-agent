import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import KeyValueEditor from "@/components/KeyValueEditor";
import Input from "@/components/Input";
import {
  ActionsRow,
  FieldLabel,
  FormField,
  FormRow,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import type { EditForm } from "./types";
import { getConfigSummary, getStateActionLabel } from "./types";

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
  gap: var(--space-md);
`;

const Name = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-weight: 600;
  flex-wrap: wrap;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const ConfigDetail = styled.div`
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
`;

const ToolItem = styled.div`
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);

  span {
    color: var(--text-secondary);
    font-family: var(--font-sans);
    margin-left: var(--space-sm);
  }
`;

type Props = {
  mcp: McpListItem;
  instruction: string;
  editForm?: EditForm;
  editOpen: boolean;
  toolsOpen: boolean;
  instructionsOpen: boolean;
  onStateToggle: () => void;
  onEditToggle: () => void;
  onDelete: () => void;
  onInstructionToggle: () => void;
  onInstructionChange: (value: string) => void;
  onInstructionSave: () => void;
  onToolsToggle: () => void;
  onOpenEdit: () => void;
  onEditFormChange: (form: EditForm) => void;
  onSaveEdit: (restart?: boolean) => void;
};

export default function McpCard({
  mcp,
  instruction,
  editForm,
  editOpen,
  toolsOpen,
  instructionsOpen,
  onStateToggle,
  onEditToggle,
  onDelete,
  onInstructionToggle,
  onInstructionChange,
  onInstructionSave,
  onToolsToggle,
  onOpenEdit,
  onEditFormChange,
  onSaveEdit,
}: Props) {
  const handleEditToggle = editOpen ? onEditToggle : onOpenEdit;

  return (
    <Card>
      <Header>
        <Name>
          <span style={{ fontSize: "1.2em" }}>{mcp.emoji || "???"}</span>
          {mcp.name}
          <Badge variant={mcp.running ? "success" : "danger"}>{mcp.running ? "running" : "stopped"}</Badge>
          <Badge>{mcp.source === "system" ? "system" : "custom"}</Badge>
          <Badge>{mcp.transport}</Badge>
        </Name>
        <Controls>
          <Button size="sm" variant="secondary" onClick={onStateToggle}>
            {getStateActionLabel(mcp)}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleEditToggle}>
            {editOpen ? "Schließen" : "Bearbeiten"}
          </Button>
          {mcp.source !== "system" && (
            <Button size="sm" variant="danger" onClick={onDelete}>
              Löschen
            </Button>
          )}
        </Controls>
      </Header>

      {!editOpen && (
        <ConfigDetail>
          {getConfigSummary(mcp)}
          {mcp.source !== "system" && mcp.transport === "stdio" && Object.keys((mcp.server as { env?: Record<string, string> }).env ?? {}).length > 0 && (
            <div style={{ marginTop: "var(--space-xs)", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
              env: {Object.entries((mcp.server as { env?: Record<string, string> }).env ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
            </div>
          )}
        </ConfigDetail>
      )}

      {editOpen && editForm && (
        <Section>
          <FormRow>
            <FormField $flex={1}>
              <FieldLabel>Name</FieldLabel>
              <Input value={editForm.name} onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })} />
            </FormField>
            <FormField>
              <FieldLabel>Emoji</FieldLabel>
              <Input
                value={editForm.emoji}
                onChange={(e) => onEditFormChange({ ...editForm, emoji: e.target.value })}
                placeholder="???"
                style={{ width: 60, textAlign: "center", fontSize: "1.2em" }}
              />
            </FormField>
          </FormRow>

          {mcp.source === "system" ? (
            <>
              {mcp.systemKey === "filesystem" && (
                <FormField>
                  <FieldLabel>Root Path</FieldLabel>
                  <Input value={editForm.rootPath} onChange={(e) => onEditFormChange({ ...editForm, rootPath: e.target.value })} />
                </FormField>
              )}
              {mcp.systemKey === "terminal" && (
                <FormField>
                  <FieldLabel>Working Directory</FieldLabel>
                  <Input value={editForm.workingDirectory} onChange={(e) => onEditFormChange({ ...editForm, workingDirectory: e.target.value })} />
                </FormField>
              )}
              {(mcp.systemKey === "web-search" || mcp.systemKey === "user-interaction" || mcp.systemKey === "task" || mcp.systemKey === "memory") && (
                <ConfigDetail>Keine weitere System-Konfiguration in v1.</ConfigDetail>
              )}
            </>
          ) : mcp.transport === "stdio" ? (
            <>
              <FormField>
                <FieldLabel>Command</FieldLabel>
                <Input value={editForm.command} onChange={(e) => onEditFormChange({ ...editForm, command: e.target.value })} />
              </FormField>
              <FormField>
                <FieldLabel>Args (ein Argument pro Zeile)</FieldLabel>
                <TextArea value={editForm.args} onChange={(e) => onEditFormChange({ ...editForm, args: e.target.value })} rows={4} />
              </FormField>
              <FormField>
                <FieldLabel>Umgebungsvariablen</FieldLabel>
                <KeyValueEditor values={editForm.env} onChange={(env) => onEditFormChange({ ...editForm, env })} />
              </FormField>
            </>
          ) : (
            <FormField>
              <FieldLabel>URL</FieldLabel>
              <Input value={editForm.url} onChange={(e) => onEditFormChange({ ...editForm, url: e.target.value })} />
            </FormField>
          )}

          <ActionsRow>
            <Button size="sm" onClick={() => onSaveEdit(false)}>Speichern</Button>
            {mcp.source !== "system" && mcp.running && (
              <Button size="sm" onClick={() => onSaveEdit(true)}>Speichern & Neustarten</Button>
            )}
            <Button size="sm" variant="secondary" onClick={onEditToggle}>Abbrechen</Button>
          </ActionsRow>
        </Section>
      )}

      <ActionsRow style={{ marginTop: "var(--space-md)" }}>
        <SectionTitle as="span">Instruction</SectionTitle>
        <Button size="sm" variant="secondary" onClick={onInstructionToggle}>
          {instructionsOpen ? "Schließen" : "Bearbeiten"}
        </Button>
        {instructionsOpen && (
          <Button size="sm" variant="secondary" onClick={onInstructionSave}>
            Speichern
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onToolsToggle}>
          {toolsOpen ? "Tools verbergen" : `Tools (${mcp.tools.length})`}
        </Button>
      </ActionsRow>

      {instructionsOpen && (
        <TextArea
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          rows={14}
          style={{ marginTop: "var(--space-sm)" }}
        />
      )}

      {toolsOpen && (
        <Section style={{ marginTop: "var(--space-md)" }}>
          {mcp.tools.map((tool) => (
            <ToolItem key={tool.name}>
              {tool.name}
              <span>{tool.description}</span>
            </ToolItem>
          ))}
        </Section>
      )}
    </Card>
  );
}
