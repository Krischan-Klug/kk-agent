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
  Section,
  SectionTitle,
} from "@/components/PageForm";
import type { EditForm } from "./types";
import { getConfigSummary } from "./types";

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
`;

const Name = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
`;

const Controls = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  flex-wrap: wrap;
  flex-shrink: 0;
`;

const StatusToggle = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
`;

const HeaderNameInput = styled(Input)`
  min-width: 0;
  flex: 1;
  font-weight: 600;
`;

const HeaderEmojiInput = styled(Input)`
  width: 56px;
  text-align: center;
  font-size: 1.2em;
  flex-shrink: 0;
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

const ScopeSelect = styled.select`
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--accent);
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
        <HeaderTop>
          <Name>
            <StatusToggle
              type="button"
              onClick={onStateToggle}
              aria-label={mcp.running ? "Stoppen" : "Starten"}
              title={mcp.running ? "Stoppen" : "Starten"}
            >
              <Badge variant={mcp.running ? "success" : "danger"}>{mcp.running ? "running" : "stopped"}</Badge>
            </StatusToggle>
            <Badge>{mcp.source === "system" ? "system" : "custom"}</Badge>
            <Badge>{mcp.transport}</Badge>
          </Name>
          <Controls>
            <Button size="sm" variant="secondary" onClick={handleEditToggle}>
              {editOpen ? "Schliessen" : "Bearbeiten"}
            </Button>
            {mcp.source !== "system" && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Loeschen
              </Button>
            )}
          </Controls>
        </HeaderTop>
        <Name>
          {editOpen && editForm ? (
            <>
              <HeaderEmojiInput
                value={editForm.emoji}
                onChange={(e) => onEditFormChange({ ...editForm, emoji: e.target.value })}
                placeholder="???"
              />
              <HeaderNameInput
                value={editForm.name}
                onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
              />
            </>
          ) : (
            <>
              <span style={{ fontSize: "1.2em" }}>{mcp.emoji || "???"}</span>
              <span style={{ fontWeight: 600 }}>{mcp.name}</span>
            </>
          )}
        </Name>
      </Header>

      {!editOpen && (
        <ConfigDetail>
          {getConfigSummary(mcp)}
          {mcp.source !== "system" &&
            mcp.transport === "stdio" &&
            Object.keys((mcp.server as { env?: Record<string, string> }).env ?? {}).length > 0 && (
              <div style={{ marginTop: "var(--space-xs)", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
                env:{" "}
                {Object.entries((mcp.server as { env?: Record<string, string> }).env ?? {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </div>
            )}
        </ConfigDetail>
      )}

      {editOpen && editForm && (
        <Section>
          {mcp.source === "system" ? (
            <>
              {mcp.systemKey === "filesystem" && (
                <>
                  <FormField>
                    <FieldLabel>Access Scope</FieldLabel>
                    <ScopeSelect
                      value={editForm.accessScope}
                      onChange={(e) => onEditFormChange({ ...editForm, accessScope: e.target.value as "user" | "system", basePath: "" })}
                    >
                      <option value="user">user</option>
                      <option value="system">system</option>
                    </ScopeSelect>
                  </FormField>
                  <FormField>
                    <FieldLabel>Base Path</FieldLabel>
                    <Input
                      value={editForm.basePath}
                      placeholder="Leer lassen fuer automatischen Scope-Default"
                      onChange={(e) => onEditFormChange({ ...editForm, basePath: e.target.value })}
                    />
                  </FormField>
                </>
              )}
              {mcp.systemKey === "terminal" && (
                <>
                  <FormField>
                    <FieldLabel>Access Scope</FieldLabel>
                    <ScopeSelect
                      value={editForm.accessScope}
                      onChange={(e) => onEditFormChange({ ...editForm, accessScope: e.target.value as "user" | "system", workingDirectory: "" })}
                    >
                      <option value="user">user</option>
                      <option value="system">system</option>
                    </ScopeSelect>
                  </FormField>
                  <FormField>
                    <FieldLabel>Working Directory</FieldLabel>
                    <Input
                      value={editForm.workingDirectory}
                      placeholder="Leer lassen fuer automatischen Scope-Default"
                      onChange={(e) => onEditFormChange({ ...editForm, workingDirectory: e.target.value })}
                    />
                  </FormField>
                  <ConfigDetail>
                    {editForm.accessScope === "system"
                      ? "system erlaubt systemweiten Terminal-Zugriff mit erhoehter Ausfuehrung."
                      : "user erlaubt nur Terminal-Zugriff innerhalb des aktuellen Nutzerbereichs."}
                  </ConfigDetail>
                </>
              )}
              {(mcp.systemKey === "web-search" ||
                mcp.systemKey === "user-interaction" ||
                mcp.systemKey === "task" ||
                mcp.systemKey === "memory" ||
                mcp.systemKey === "attachment") && <ConfigDetail>Keine weitere System-Konfiguration in v1.</ConfigDetail>}
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
            <Button size="sm" onClick={() => onSaveEdit(false)}>
              Speichern
            </Button>
            {mcp.source !== "system" && mcp.running && (
              <Button size="sm" onClick={() => onSaveEdit(true)}>
                Speichern & Neustarten
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onEditToggle}>
              Abbrechen
            </Button>
          </ActionsRow>
        </Section>
      )}

      <ActionsRow style={{ marginTop: "var(--space-md)" }}>
        <SectionTitle as="span">Instruction</SectionTitle>
        <Button size="sm" variant="secondary" onClick={onInstructionToggle}>
          {instructionsOpen ? "Schliessen" : "Bearbeiten"}
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
