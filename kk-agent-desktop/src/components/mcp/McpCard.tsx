import styled from "styled-components";
import type { McpListItem } from "@/types/api";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Input from "@/components/Input";
import SkillIcon from "@/components/SkillIcon";
import { ActionsRow, Section } from "@/components/PageForm";
import { StatusDot } from "@/components/agent/AgentEditor.styled";
import type { EditForm } from "./types";
import { InstructionEditorBlock, McpEditFields } from "./McpCard.parts";
import { parseMcpServerJson } from "./configJson";

const Header = styled.div<{ $withBody: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: ${(p) => (p.$withBody ? "var(--space-md)" : "0")};
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: center;
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

const RuntimeNotice = styled.div`
  color: var(--danger);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
`;

type Props = {
  mcp: McpListItem;
  instruction: string;
  editForm?: EditForm;
  editOpen: boolean;
  systemVariables?: string[];
  onStateToggle: () => void;
  onEditToggle: () => void;
  onDelete?: () => void;
  onInstructionChange: (value: string) => void;
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
  systemVariables = [],
  onStateToggle,
  onEditToggle,
  onDelete,
  onInstructionChange,
  onOpenEdit,
  onEditFormChange,
  onSaveEdit,
}: Props) {
  const handleEditToggle = editOpen ? onEditToggle : onOpenEdit;
  const isActive = mcp.runtime.status === "running";
  const statusTitle = mcp.runtime.status === "unavailable"
    ? `Unavailable${mcp.runtime.error ? `: ${mcp.runtime.error}` : ""}`
    : isActive ? "Active" : "Inactive";
  const hasBody = editOpen && Boolean(editForm);
  const customConfigInvalid = mcp.source === "custom" && editForm
    ? !parseMcpServerJson(editForm.serverJson, mcp.transport).ok
    : false;

  return (
    <Card>
      <Header $withBody={hasBody}>
        <HeaderTop>
          <Name>
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
                <span style={{ fontSize: "1.2em", lineHeight: 1, display: "inline-flex" }}>
                  {mcp.id === "skill" ? <SkillIcon /> : mcp.emoji || DEFAULT_MCP_EMOJI}
                </span>
                <NameText title={mcp.name}>{mcp.name}</NameText>
              </>
            )}
            <StatusToggle
              type="button"
              onClick={onStateToggle}
              aria-label={mcp.active ? "Disable" : "Enable"}
              title={statusTitle}
            >
              <StatusDot $running={isActive} />
            </StatusToggle>
          </Name>
          <Controls>
            <Button size="sm" variant="secondary" onClick={handleEditToggle}>
              {editOpen ? "Close" : "Edit"}
            </Button>
          </Controls>
        </HeaderTop>
        {mcp.runtime.status === "unavailable" && (
          <RuntimeNotice>{mcp.runtime.error || "Unavailable"}</RuntimeNotice>
        )}
      </Header>

      {editOpen && editForm && (
        <Section>
          <McpEditFields mcp={mcp} editForm={editForm} onEditFormChange={onEditFormChange} />

          <ActionsRow>
            <Button size="sm" onClick={onSaveEdit} disabled={customConfigInvalid}>
              Save
            </Button>
            {mcp.source === "custom" && onDelete && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onEditToggle}>
              Cancel
            </Button>
          </ActionsRow>

          <InstructionEditorBlock
            instruction={instruction}
            systemVariables={systemVariables}
            title="Instruction"
            onInstructionChange={onInstructionChange}
          />
        </Section>
      )}
    </Card>
  );
}
