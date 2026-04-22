import styled from "styled-components";
import type { ChatMode, CreateSkillBody, McpListItem, SkillDefinition, UpdateSkillBody } from "@/types/api";
import Button from "@/components/Button";
import Input from "@/components/Input";
import Select from "@/components/Select";
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

const SummaryCard = styled.div`
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
`;

export type SkillDraft = CreateSkillBody;

export const EMPTY_SKILL_DRAFT: SkillDraft = {
  name: "",
  description: "",
  instruction: "",
  active: true,
  recommendedToolIds: [],
  recommendedMcpIds: [],
  allowedModes: ["plan", "edit", "autonomous"],
};

export function skillToDraft(skill: SkillDefinition): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    instruction: skill.instruction,
    active: skill.active,
    recommendedToolIds: [...skill.recommendedToolIds],
    recommendedMcpIds: [...skill.recommendedMcpIds],
    allowedModes: [...skill.allowedModes],
  };
}

export function toCreateBody(draft: SkillDraft): CreateSkillBody {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    instruction: draft.instruction.trim(),
    active: draft.active,
    recommendedToolIds: draft.recommendedToolIds,
    recommendedMcpIds: draft.recommendedMcpIds,
    allowedModes: draft.allowedModes,
  };
}

export function toUpdateBody(draft: SkillDraft): UpdateSkillBody {
  return toCreateBody(draft);
}

function toggleEntry(list: string[], value: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);
}

function toggleMode(list: ChatMode[], value: ChatMode, enabled: boolean): ChatMode[] {
  const next = enabled ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);
  return next.length > 0 ? next : ["plan", "edit", "autonomous"];
}

type Props = {
  skill: SkillDefinition | null;
  draft: SkillDraft | null;
  isCreateMode: boolean;
  saving: boolean;
  toolCapabilities: McpListItem[];
  mcpCapabilities: McpListItem[];
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
  toolCapabilities,
  mcpCapabilities,
  usage,
  onChange,
  onSave,
  onDelete,
  onCancelCreate,
}: Props) {
  if (!draft) {
    return (
      <EditorArea>
        <EmptyHint>Waehle einen Skill aus oder erstelle einen neuen.</EmptyHint>
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
          Skills werden als lokale Bundles in <code>state/skills</code> gespeichert. Die Ansicht entspricht bewusst dem Agent-Editor.
        </MutedText>
        {!isCreateMode && skill && (
          <SummaryCard>
            ID: {skill.id} · Pfad: {skill.path}
          </SummaryCard>
        )}
      </Section>

      <Section>
        <SectionTitle>Skill Info</SectionTitle>
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
            <FieldLabel>Kurzbeschreibung</FieldLabel>
            <Input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="Beschreibt Aufgabe und Trigger knapp."
            />
          </FormField>
        </FormRow>
        <FormField>
          <FieldLabel>Instruction</FieldLabel>
          <TextArea
            rows={10}
            value={draft.instruction}
            onChange={(e) => onChange({ ...draft, instruction: e.target.value })}
            placeholder={"Nutze Read, Glob und Grep vor Aenderungen.\nHalte Ergebnisse knapp und dateibezogen."}
          />
          <MutedText>Kurz, direkt, imperative Form. Kein Fuelltext, keine doppelten Erklaerungen.</MutedText>
        </FormField>
      </Section>

      <Section>
        <SectionTitle>Verfuegbarkeit</SectionTitle>
        <FormRow>
          <FormField $minWidth="180px">
            <FieldLabel>Status</FieldLabel>
            <Select
              value={draft.active ? "active" : "inactive"}
              onChange={(e) => onChange({ ...draft, active: e.target.value === "active" })}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Deaktiviert</option>
            </Select>
          </FormField>
        </FormRow>
        <FormField>
          <FieldLabel>Modes</FieldLabel>
          <ToggleGrid>
            {(["plan", "edit", "autonomous"] as ChatMode[]).map((mode) => (
              <ToggleCard key={mode}>
                <input
                  type="checkbox"
                  checked={draft.allowedModes?.includes(mode) ?? false}
                  onChange={(e) => onChange({
                    ...draft,
                    allowedModes: toggleMode(draft.allowedModes ?? EMPTY_SKILL_DRAFT.allowedModes!, mode, e.target.checked),
                  })}
                />
                <span>{mode}</span>
              </ToggleCard>
            ))}
          </ToggleGrid>
        </FormField>
      </Section>

      <Section>
        <SectionTitle>Empfehlungen</SectionTitle>
        <FormField>
          <FieldLabel>Interne Tools</FieldLabel>
          <ToggleGrid>
            {toolCapabilities.map((tool) => (
              <ToggleCard key={tool.id}>
                <input
                  type="checkbox"
                  checked={draft.recommendedToolIds?.includes(tool.id) ?? false}
                  onChange={(e) => onChange({
                    ...draft,
                    recommendedToolIds: toggleEntry(draft.recommendedToolIds ?? [], tool.id, e.target.checked),
                  })}
                />
                <span>{tool.name}</span>
              </ToggleCard>
            ))}
          </ToggleGrid>
        </FormField>
        <FormField>
          <FieldLabel>MCPs</FieldLabel>
          <ToggleGrid>
            {mcpCapabilities.map((mcp) => (
              <ToggleCard key={mcp.id}>
                <input
                  type="checkbox"
                  checked={draft.recommendedMcpIds?.includes(mcp.id) ?? false}
                  onChange={(e) => onChange({
                    ...draft,
                    recommendedMcpIds: toggleEntry(draft.recommendedMcpIds ?? [], mcp.id, e.target.checked),
                  })}
                />
                <span>{mcp.name}</span>
              </ToggleCard>
            ))}
          </ToggleGrid>
        </FormField>
      </Section>

      {!isCreateMode && (
        <Section>
          <SectionTitle>Verknuepfungen</SectionTitle>
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
