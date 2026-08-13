import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import {
  ActionsRow,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import { StatusDot } from "@/components/agent/AgentEditor.styled";
import type { EditForm } from "./types";
import { getConfigSummary } from "./types";
import { ConfigDetail, InstructionEditorBlock, McpEditFields } from "./McpCard.parts";

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
  hideMcpMetadata?: boolean;
  showConfigDetail?: boolean;
  compactHeader?: boolean;
  showDeleteButton?: boolean;
  showDeleteInEdit?: boolean;
  showInstructionControls?: boolean;
  showToolsControls?: boolean;
  showInstructionInEdit?: boolean;
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
  onSaveEdit: () => void;
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
}: Props) {
  const handleEditToggle = editOpen ? onEditToggle : onOpenEdit;
  const configSummary = getConfigSummary(mcp);
  const showInstructionEditor = showInstructionInEdit ? editOpen : instructionsOpen;
  const isRunning = mcp.runtime.status === "running";
  const isActive = mcp.source === "system" ? mcp.active !== false : isRunning;
  const statusTitle = mcp.runtime.status === "unavailable"
    ? `Unavailable${mcp.runtime.error ? `: ${mcp.runtime.error}` : ""}`
    : isActive ? "Active" : "Inactive";
  const hasBody =
    (!editOpen && showConfigDetail && Boolean(configSummary))
    || (editOpen && Boolean(editForm))
    || ((showInstructionControls || showToolsControls) && !showInstructionInEdit)
    || (showInstructionEditor && !showInstructionInEdit)
    || toolsOpen;

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
                  aria-label={isRunning ? "Stop" : "Start"}
                  title={statusTitle}
                >
                  <Badge variant={isRunning ? "success" : "danger"}>{mcp.runtime.status}</Badge>
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
                aria-label={isActive ? "Disable" : "Enable"}
                title={statusTitle}
              >
                <StatusDot $running={isActive} />
              </StatusToggle>
            )}
          </Name>
          <Controls>
            <Button size="sm" variant="secondary" onClick={handleEditToggle}>
              {editOpen ? "Close" : "Edit"}
            </Button>
            {showDeleteButton && mcp.source !== "system" && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
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
          <McpEditFields mcp={mcp} editForm={editForm} onEditFormChange={onEditFormChange} />

          <ActionsRow>
            <Button size="sm" onClick={onSaveEdit}>
              Save
            </Button>
            {showDeleteInEdit && mcp.source !== "system" && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onEditToggle}>
              Cancel
            </Button>
          </ActionsRow>

          {showInstructionInEdit && (
            <InstructionEditorBlock
              instruction={instruction}
              systemVariables={systemVariables}
              title="Instruction"
              onInstructionChange={onInstructionChange}
            />
          )}
        </Section>
      )}

      {(showInstructionControls || showToolsControls) && (
        <ActionsRow style={{ marginTop: "var(--space-md)" }}>
          {showInstructionControls && (
            <>
              <SectionTitle as="span">Instruction</SectionTitle>
              <Button size="sm" variant="secondary" onClick={onInstructionToggle}>
                {instructionsOpen ? "Close" : "Edit"}
              </Button>
              {instructionsOpen && (
                <Button size="sm" variant="secondary" onClick={onInstructionSave}>
                  Save
                </Button>
              )}
            </>
          )}
          {showToolsControls && (
            <Button size="sm" variant="secondary" onClick={onToolsToggle}>
              {toolsOpen ? "Hide tools" : `Tools (${mcp.tools.length})`}
            </Button>
          )}
        </ActionsRow>
      )}

      {showInstructionEditor && !showInstructionInEdit && (
        <InstructionEditorBlock
          instruction={instruction}
          systemVariables={systemVariables}
          onInstructionChange={onInstructionChange}
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
