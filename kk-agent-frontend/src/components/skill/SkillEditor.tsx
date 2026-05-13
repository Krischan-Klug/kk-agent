import styled from "styled-components";
import type { CreateSkillBody, McpListItem, SkillDefinition, UpdateSkillBody } from "@/types/api";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import {
  ActionsRow,
  EmptyHint,
  FieldLabel,
  FormField,
  FormRow,
  MutedText,
  Section,
  SectionTitle,
  SurfaceBox,
} from "@/components/PageForm";
import { toggleId } from "@/lib/idLists";
import type { SkillUsage } from "./SkillList";

const EditorArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
`;

const SummaryCard = styled.div`
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
`;

const ToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-xs);
`;

const ToggleCard = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;

  input {
    accent-color: var(--accent);
  }
`;

export type SkillDraft = CreateSkillBody & {
  linkedToolIds: string[];
  linkedMcpIds: string[];
};

export const EMPTY_SKILL_DRAFT: SkillDraft = {
  name: "",
  description: "",
  instruction: "",
  linkedToolIds: [],
  linkedMcpIds: [],
};

export function skillToDraft(skill: SkillDefinition): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    instruction: skill.instruction,
    linkedToolIds: [...skill.linkedToolIds],
    linkedMcpIds: [...skill.linkedMcpIds],
  };
}

export function toCreateBody(draft: SkillDraft): CreateSkillBody {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    instruction: draft.instruction.trim(),
  };
}

export function toUpdateBody(draft: SkillDraft): UpdateSkillBody {
  return toCreateBody(draft);
}

type LinkedCapabilitySectionProps = {
  title: string;
  items: Array<{ id: string; name: string }>;
  selectedIds: string[];
  emptyHint: string;
  onChange: (ids: string[]) => void;
};

function LinkedCapabilitySection({
  title,
  items,
  selectedIds,
  emptyHint,
  onChange,
}: LinkedCapabilitySectionProps) {
  return (
    <Section>
      <SectionTitle>{title}</SectionTitle>
      {items.length > 0 ? (
        <ToggleGrid>
          {items.map((item) => (
            <ToggleCard key={item.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={(event) => onChange(toggleId(selectedIds, item.id, event.target.checked))}
              />
              <span>{item.name}</span>
            </ToggleCard>
          ))}
        </ToggleGrid>
      ) : (
        <EmptyHint>{emptyHint}</EmptyHint>
      )}
    </Section>
  );
}

type Props = {
  skill: SkillDefinition | null;
  draft: SkillDraft | null;
  isCreateMode: boolean;
  saving: boolean;
  internalTools: McpListItem[];
  mcps: McpListItem[];
  usage?: SkillUsage;
  onChange: (draft: SkillDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancelCreate: () => void;
};

export default function SkillEditor({
  skill,
  draft,
  isCreateMode,
  saving,
  internalTools,
  mcps,
  usage,
  onChange,
  onSave,
  onDelete,
  onCancelCreate,
}: Props) {
  if (!draft) {
    return (
      <EditorArea>
        <EmptyHint>Select a skill or import a bundle folder.</EmptyHint>
      </EditorArea>
    );
  }

  const title = isCreateMode ? "Create skill" : draft.name || skill?.name || "Skill";
  const hasUsage = usage && (usage.tools.length > 0 || usage.mcps.length > 0);
  const saveDisabled = !draft.name.trim() || !draft.description.trim() || !draft.instruction.trim() || saving;

  return (
    <EditorArea>
      <Section>
        <SectionTitle>{title}</SectionTitle>
        <MutedText>
          Skills are standard bundles with <code>SKILL.md</code> in <code>state/skills</code>. KK-Agent links are stored separately in <code>agents/kk-agent.json</code>.
        </MutedText>
        {!isCreateMode && skill && (
          <SummaryCard>
            ID: {skill.id} | Path: {skill.path}
          </SummaryCard>
        )}
      </Section>

      <Section>
        <SectionTitle>SKILL.md</SectionTitle>
        <FormRow>
          <FormField $flex={1}>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="e.g. Repo Analysis"
            />
          </FormField>
          <FormField $flex={2}>
            <FieldLabel>Description</FieldLabel>
            <Input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="A short description with trigger."
            />
          </FormField>
        </FormRow>
        <FormField>
          <FieldLabel>Instruction</FieldLabel>
          <TextArea
            rows={12}
            value={draft.instruction}
            onChange={(e) => onChange({ ...draft, instruction: e.target.value })}
            placeholder={"Read the relevant files first.\nList the main risks.\nKeep the final summary short."}
          />
        </FormField>
      </Section>

      <LinkedCapabilitySection
        title="Linked internal tools"
        items={internalTools}
        selectedIds={draft.linkedToolIds}
        emptyHint="No internal tools present."
        onChange={(linkedToolIds) => onChange({ ...draft, linkedToolIds })}
      />

      <LinkedCapabilitySection
        title="Linked MCPs"
        items={mcps}
        selectedIds={draft.linkedMcpIds}
        emptyHint="No MCPs present."
        onChange={(linkedMcpIds) => onChange({ ...draft, linkedMcpIds })}
      />

      {!isCreateMode && (
        <Section>
          <SectionTitle>Current usages</SectionTitle>
          {hasUsage ? (
            <>
              {usage.tools.length > 0 && <SurfaceBox><strong>Tools:</strong> {usage.tools.join(", ")}</SurfaceBox>}
              {usage.mcps.length > 0 && <SurfaceBox><strong>MCPs:</strong> {usage.mcps.join(", ")}</SurfaceBox>}
            </>
          ) : (
            <EmptyHint>No links present.</EmptyHint>
          )}
        </Section>
      )}

      <ActionsRow>
        <Button onClick={onSave} disabled={saveDisabled}>
          {saving ? (isCreateMode ? "Creating..." : "Saving...") : (isCreateMode ? "Create skill" : "Save")}
        </Button>
        {isCreateMode ? (
          <Button variant="secondary" onClick={onCancelCreate} disabled={saving}>
            Discard
          </Button>
        ) : (
          <Button variant="danger" onClick={onDelete} disabled={saving}>
            Delete
          </Button>
        )}
      </ActionsRow>
    </EditorArea>
  );
}
