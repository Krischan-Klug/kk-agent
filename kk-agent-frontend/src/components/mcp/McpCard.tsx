import { useState } from "react";
import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import {
  ActionsRow,
  FieldLabel,
  FormField,
  MutedText,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import { StatusDot } from "@/components/agent/AgentEditor.styled";
import { useDropdown } from "@/hooks/useDropdown";
import type { EditForm } from "./types";
import { getConfigSummary } from "./types";

const Header = styled.div<{ $withBody: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: ${(p) => (p.$withBody ? "var(--space-md)" : "0")};
`;

const HeaderTop = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: ${(p) => (p.$compact ? "center" : "flex-start")};
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: nowrap;
`;

const Name = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: nowrap;
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
  min-width: 56px;
  text-align: center;
  font-size: 1.2em;
  flex-shrink: 0;
`;

const NameText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
`;

const ConfigDetail = styled.div`
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: pre-wrap;
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

type Props = {
  mcp: McpListItem;
  instruction: string;
  editForm?: EditForm;
  editOpen: boolean;
  toolsOpen: boolean;
  instructionsOpen: boolean;
  hideMcpMetadata?: boolean;
  showConfigDetail?: boolean;
  compactHeader?: boolean;
  showDeleteButton?: boolean;
  showDeleteInEdit?: boolean;
  showInstructionControls?: boolean;
  showToolsControls?: boolean;
  showInstructionInEdit?: boolean;
  availableSkills?: SkillOption[];
  systemVariables?: string[];
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
  onSkillToggle?: (skillId: string, linked: boolean) => void;
};

const DEFAULT_MCP_EMOJI = "🧩";

export default function McpCard({
  mcp,
  instruction,
  editForm,
  editOpen,
  toolsOpen,
  instructionsOpen,
  hideMcpMetadata = false,
  showConfigDetail = true,
  compactHeader = false,
  showDeleteButton = true,
  showDeleteInEdit = false,
  showInstructionControls = true,
  showToolsControls = true,
  showInstructionInEdit = false,
  availableSkills,
  systemVariables = [],
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
  onSkillToggle,
}: Props) {
  const [showSystemVariables, setShowSystemVariables] = useState(false);
  const skillDropdown = useDropdown<HTMLDivElement>();
  const linkedSkillIds = mcp.skillIds ?? [];
  const handleEditToggle = editOpen ? onEditToggle : onOpenEdit;
  const configSummary = getConfigSummary(mcp);
  const showInstructionEditor = showInstructionInEdit ? editOpen : instructionsOpen;
  const isActive = mcp.source === "system" ? mcp.active !== false : mcp.running;
  const linkedSkills = (availableSkills ?? []).filter((skill) => linkedSkillIds.includes(skill.id));
  const hasBody =
    (!editOpen && showConfigDetail && Boolean(configSummary))
    || (editOpen && Boolean(editForm))
    || ((showInstructionControls || showToolsControls) && !showInstructionInEdit)
    || (showInstructionEditor && !showInstructionInEdit)
    || toolsOpen;

  function renderLinkedSkills() {
    if (!availableSkills || availableSkills.length === 0 || !onSkillToggle) return null;

    return (
      <div style={{ marginTop: "var(--space-md)" }}>
        <SectionTitle as="span">Linked Skills</SectionTitle>
        <MutedText>
          Skills linked here are automatically added to the skill catalog of any session that uses this {mcp.source === "system" ? "tool" : "MCP"}.
        </MutedText>
        <SkillPicker ref={skillDropdown.ref}>
          <SkillPickerButton type="button" onClick={skillDropdown.toggle}>
            Skills waehlen ({linkedSkills.length})
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
            <LinkedSkillsEmpty>Keine Skills verlinkt.</LinkedSkillsEmpty>
          )}
        </LinkedSkillsPreview>
      </div>
    );
  }

  function renderSystemVariables() {
    if (systemVariables.length === 0) return null;

    return (
      <>
        <ActionsRow style={{ marginTop: "var(--space-md)" }}>
          <Button size="sm" variant="secondary" type="button" onClick={() => setShowSystemVariables((prev) => !prev)}>
            {showSystemVariables ? "Systemvariablen ausblenden" : "Systemvariablen anzeigen"}
          </Button>
        </ActionsRow>
        {showSystemVariables && <MutedText>{systemVariables.join(", ")}</MutedText>}
      </>
    );
  }

  return (
    <Card>
      <Header $withBody={hasBody}>
        <HeaderTop $compact={compactHeader}>
          <Name>
            {!compactHeader && (
              <>
                <StatusToggle
                  type="button"
                  onClick={onStateToggle}
                  aria-label={mcp.running ? "Stoppen" : "Starten"}
                  title={mcp.running ? "Stoppen" : "Starten"}
                >
                  <Badge variant={mcp.running ? "success" : "danger"}>{mcp.running ? "running" : "stopped"}</Badge>
                </StatusToggle>
                {!hideMcpMetadata && (
                  <>
                    <Badge>{mcp.source === "system" ? "system" : "custom"}</Badge>
                    <Badge>{mcp.transport}</Badge>
                  </>
                )}
              </>
            )}
            {editOpen && editForm ? (
              <>
                <HeaderEmojiInput
                  value={editForm.emoji}
                  onChange={(e) => onEditFormChange({ ...editForm, emoji: e.target.value })}
                  placeholder={DEFAULT_MCP_EMOJI}
                />
                <HeaderNameInput
                  value={editForm.name}
                  onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                />
              </>
            ) : (
              <>
                <span style={{ fontSize: "1.2em" }}>{mcp.emoji || DEFAULT_MCP_EMOJI}</span>
                <NameText title={mcp.name}>{mcp.name}</NameText>
              </>
            )}
            {compactHeader && (
              <StatusToggle
                type="button"
                onClick={onStateToggle}
                aria-label={isActive ? "Deaktivieren" : "Aktivieren"}
                title={isActive ? "Aktiv" : "Inaktiv"}
              >
                <StatusDot $running={isActive} />
              </StatusToggle>
            )}
          </Name>
          <Controls>
            <Button size="sm" variant="secondary" onClick={handleEditToggle}>
              {editOpen ? "Schliessen" : "Bearbeiten"}
            </Button>
            {showDeleteButton && mcp.source !== "system" && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Loeschen
              </Button>
            )}
          </Controls>
        </HeaderTop>
      </Header>

      {!editOpen && showConfigDetail && configSummary && (
        <ConfigDetail>{configSummary}</ConfigDetail>
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
              {(mcp.systemKey === "filesystem" || mcp.systemKey === "terminal" || mcp.systemKey === "web-search") && (
                <>
                  <FormField>
                    <FieldLabel>Preview Threshold (chars)</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      value={editForm.previewThresholdChars}
                      placeholder="Leer lassen fuer Tool-Default"
                      onChange={(e) => onEditFormChange({ ...editForm, previewThresholdChars: e.target.value })}
                    />
                  </FormField>
                  <FormField>
                    <FieldLabel>Preview Chars</FieldLabel>
                    <Input
                      type="number"
                      min={200}
                      value={editForm.previewChars}
                      placeholder="Leer lassen fuer Tool-Default"
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
                <FieldLabel>Args (ein Argument pro Zeile)</FieldLabel>
                <TextArea value={editForm.args} onChange={(e) => onEditFormChange({ ...editForm, args: e.target.value })} rows={4} />
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
            {showDeleteInEdit && mcp.source !== "system" && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Loeschen
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onEditToggle}>
              Abbrechen
            </Button>
          </ActionsRow>

          {renderSystemVariables()}
          {showInstructionInEdit && (
            <>
              <SectionTitle style={{ marginTop: "var(--space-md)" }}>Instruction</SectionTitle>
              <TextArea
                value={instruction}
                onChange={(e) => onInstructionChange(e.target.value)}
                rows={14}
                style={{ marginTop: "var(--space-sm)" }}
              />
              {renderLinkedSkills()}
            </>
          )}
        </Section>
      )}

      {(showInstructionControls || showToolsControls) && (
        <ActionsRow style={{ marginTop: "var(--space-md)" }}>
          {showInstructionControls && (
            <>
              <SectionTitle as="span">Instruction</SectionTitle>
              <Button size="sm" variant="secondary" onClick={onInstructionToggle}>
                {instructionsOpen ? "Schliessen" : "Bearbeiten"}
              </Button>
              {instructionsOpen && (
                <Button size="sm" variant="secondary" onClick={onInstructionSave}>
                  Speichern
                </Button>
              )}
            </>
          )}
          {showToolsControls && (
            <Button size="sm" variant="secondary" onClick={onToolsToggle}>
              {toolsOpen ? "Tools verbergen" : `Tools (${mcp.tools.length})`}
            </Button>
          )}
        </ActionsRow>
      )}

      {showInstructionEditor && !showInstructionInEdit && (
        <>
          {renderSystemVariables()}
          <TextArea
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            rows={14}
            style={{ marginTop: "var(--space-sm)" }}
          />
          {renderLinkedSkills()}
        </>
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
