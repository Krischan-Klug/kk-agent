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

function toggleEntry(list: string[], value: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);
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
        <EmptyHint>Waehle einen Skill aus oder importiere einen Bundle-Ordner.</EmptyHint>
      </EditorArea>
    );
  }

  const title = isCreateMode ? "Skill erstellen" : draft.name || skill?.name || "Skill";
  const hasUsage = usage && (usage.tools.length > 0 || usage.mcps.length > 0);
  const saveDisabled = !draft.name.trim() || !draft.description.trim() || !draft.instruction.trim() || saving;

  return (
    <EditorArea>
      <Section>
        <SectionTitle>{title}</SectionTitle>
        <MutedText>
          Skills sind Standard-Bundles mit <code>SKILL.md</code> in <code>state/skills</code>. KK-Agent-Links werden separat in <code>agents/kk-agent.json</code> gespeichert.
        </MutedText>
        {!isCreateMode && skill && (
          <SummaryCard>
            ID: {skill.id} | Pfad: {skill.path}
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
              placeholder="z.B. Repo Analysis"
            />
          </FormField>
          <FormField $flex={2}>
            <FieldLabel>Beschreibung</FieldLabel>
            <Input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="Eine kurze Beschreibung mit Trigger."
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

      <Section>
        <SectionTitle>Verknuepfte interne Tools</SectionTitle>
        {internalTools.length > 0 ? (
          <ToggleGrid>
            {internalTools.map((tool) => (
              <ToggleCard key={tool.id}>
                <input
                  type="checkbox"
                  checked={draft.linkedToolIds.includes(tool.id)}
                  onChange={(e) => onChange({
                    ...draft,
                    linkedToolIds: toggleEntry(draft.linkedToolIds, tool.id, e.target.checked),
                  })}
                />
                <span>{tool.name}</span>
              </ToggleCard>
            ))}
          </ToggleGrid>
        ) : (
          <EmptyHint>Keine internen Tools vorhanden.</EmptyHint>
        )}
      </Section>

      <Section>
        <SectionTitle>Verknuepfte MCPs</SectionTitle>
        {mcps.length > 0 ? (
          <ToggleGrid>
            {mcps.map((mcp) => (
              <ToggleCard key={mcp.id}>
                <input
                  type="checkbox"
                  checked={draft.linkedMcpIds.includes(mcp.id)}
                  onChange={(e) => onChange({
                    ...draft,
                    linkedMcpIds: toggleEntry(draft.linkedMcpIds, mcp.id, e.target.checked),
                  })}
                />
                <span>{mcp.name}</span>
              </ToggleCard>
            ))}
          </ToggleGrid>
        ) : (
          <EmptyHint>Keine MCPs vorhanden.</EmptyHint>
        )}
      </Section>

      {!isCreateMode && (
        <Section>
          <SectionTitle>Aktuelle Verwendungen</SectionTitle>
          {hasUsage ? (
            <>
              {usage.tools.length > 0 && <SurfaceBox><strong>Tools:</strong> {usage.tools.join(", ")}</SurfaceBox>}
              {usage.mcps.length > 0 && <SurfaceBox><strong>MCPs:</strong> {usage.mcps.join(", ")}</SurfaceBox>}
            </>
          ) : (
            <EmptyHint>Keine Verknuepfungen vorhanden.</EmptyHint>
          )}
        </Section>
      )}

      <ActionsRow>
        <Button onClick={onSave} disabled={saveDisabled}>
          {saving ? (isCreateMode ? "Erstellt..." : "Speichert...") : (isCreateMode ? "Skill erstellen" : "Speichern")}
        </Button>
        {isCreateMode ? (
          <Button variant="secondary" onClick={onCancelCreate} disabled={saving}>
            Verwerfen
          </Button>
        ) : (
          <Button variant="danger" onClick={onDelete} disabled={saving}>
            Loeschen
          </Button>
        )}
      </ActionsRow>
    </EditorArea>
  );
}
