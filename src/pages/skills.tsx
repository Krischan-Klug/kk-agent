import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { mcp as mcpApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { ChatMode, CreateSkillBody, McpListItem, SkillDefinition, UpdateSkillBody } from "@/types/api";
import { PageTitle } from "@/components/Layout.styled";
import Button from "@/components/Button";
import Input from "@/components/Input";
import Spinner from "@/components/Spinner";
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

const PageStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
`;

const SKILL_EMOJI = "\u{1F4DA}";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--space-lg);
`;

const Card = styled(Section)`
  padding: var(--space-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  input {
    accent-color: var(--accent);
  }
`;

const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-xs);
`;

const CapabilityToggle = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);

  input {
    accent-color: var(--accent);
  }
`;

type SkillDraft = CreateSkillBody;

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  instruction: "",
  active: true,
  recommendedToolIds: [],
  recommendedMcpIds: [],
  allowedModes: ["plan", "edit", "autonomous"],
};

function toggleEntry(list: string[], value: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);
}

function toggleMode(list: ChatMode[], value: ChatMode, enabled: boolean): ChatMode[] {
  const next = enabled ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);
  return next.length > 0 ? next : ["plan", "edit", "autonomous"];
}

function toUpdateBody(draft: SkillDraft): UpdateSkillBody {
  return {
    name: draft.name,
    description: draft.description,
    instruction: draft.instruction,
    active: draft.active,
    recommendedToolIds: draft.recommendedToolIds,
    recommendedMcpIds: draft.recommendedMcpIds,
    allowedModes: draft.allowedModes,
  };
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [toolCapabilities, setToolCapabilities] = useState<McpListItem[]>([]);
  const [mcpCapabilities, setMcpCapabilities] = useState<McpListItem[]>([]);
  const [createDraft, setCreateDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [editDrafts, setEditDrafts] = useState<Record<string, SkillDraft>>({});

  const sortedSkills = useMemo(
    () => [...skills].sort((left, right) => left.name.localeCompare(right.name)),
    [skills],
  );

  const usageBySkillId = useMemo(() => {
    const map = new Map<string, { tools: string[]; mcps: string[] }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { tools: [], mcps: [] };
        map.set(id, entry);
      }
      return entry;
    };
    for (const tool of toolCapabilities) {
      for (const skillId of tool.skillIds ?? []) ensure(skillId).tools.push(tool.name);
    }
    for (const mcp of mcpCapabilities) {
      for (const skillId of mcp.skillIds ?? []) ensure(skillId).mcps.push(mcp.name);
    }
    return map;
  }, [toolCapabilities, mcpCapabilities]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    try {
      const [skillList, toolList, mcpList] = await Promise.all([
        skillsApi.list(),
        toolsApi.list(),
        mcpApi.list(),
      ]);
      setSkills(skillList);
      setToolCapabilities(toolList);
      setMcpCapabilities(mcpList);
      setEditDrafts(Object.fromEntries(skillList.map((skill) => [
        skill.id,
        {
          name: skill.name,
          description: skill.description,
          instruction: skill.instruction,
          active: skill.active,
          recommendedToolIds: [...skill.recommendedToolIds],
          recommendedMcpIds: [...skill.recommendedMcpIds],
          allowedModes: [...skill.allowedModes],
        },
      ])));
    } catch (err) {
      logUiError("skills-load", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createDraft.name.trim() || !createDraft.description.trim() || !createDraft.instruction.trim()) return;
    setCreating(true);
    try {
      await skillsApi.create({
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        instruction: createDraft.instruction.trim(),
        active: createDraft.active,
        recommendedToolIds: createDraft.recommendedToolIds,
        recommendedMcpIds: createDraft.recommendedMcpIds,
        allowedModes: createDraft.allowedModes,
      });
      setCreateDraft(EMPTY_DRAFT);
      await loadAll();
    } catch (err) {
      logUiError("skills-create", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(id: string) {
    const draft = editDrafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      await skillsApi.update(id, toUpdateBody({
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        instruction: draft.instruction.trim(),
      }));
      await loadAll();
    } catch (err) {
      logUiError("skills-save", err);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setSavingId(id);
    try {
      await skillsApi.delete(id);
      await loadAll();
    } catch (err) {
      logUiError("skills-delete", err);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageTitle>{SKILL_EMOJI} Skills</PageTitle>
      <PageStack>
        <Card>
          <SectionTitle>{SKILL_EMOJI} Skill erstellen</SectionTitle>
          <MutedText>
            Neue Skills werden direkt als Bundle in `state/skills` gespeichert. Das Backend erzeugt dafuer automatisch den Skill-Ordner, die `SKILL.md` und die Skill-Metadaten.
          </MutedText>

          <FormRow>
            <FormField $flex={1}>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={createDraft.name}
                onChange={(e) => setCreateDraft((previous) => ({ ...previous, name: e.target.value }))}
                placeholder="Repo Analysis"
              />
            </FormField>
            <FormField $flex={1}>
              <FieldLabel>Kurzbeschreibung</FieldLabel>
              <Input
                value={createDraft.description}
                onChange={(e) => setCreateDraft((previous) => ({ ...previous, description: e.target.value }))}
                placeholder="Analysiert ein Repo vor Aenderungen."
              />
            </FormField>
          </FormRow>

          <FormField>
            <FieldLabel>Instruction</FieldLabel>
            <TextArea
              rows={8}
              value={createDraft.instruction}
              onChange={(e) => setCreateDraft((previous) => ({ ...previous, instruction: e.target.value }))}
              placeholder={"Nutze Read, Glob und Grep, bevor du Aenderungen vorschlaegst.\nHalte Ergebnisse knapp und dateibezogen."}
            />
          </FormField>

          <FormField>
            <FieldLabel>Aktiv</FieldLabel>
            <ToggleRow>
              <input
                type="checkbox"
                checked={createDraft.active ?? true}
                onChange={(e) => setCreateDraft((previous) => ({ ...previous, active: e.target.checked }))}
              />
              <span>{createDraft.active ? "aktiv" : "deaktiviert"}</span>
            </ToggleRow>
          </FormField>

          <Section>
            <FieldLabel>Verfuegbare Modes</FieldLabel>
            <CapabilityGrid>
              {(["plan", "edit", "autonomous"] as ChatMode[]).map((mode) => (
                <CapabilityToggle key={mode}>
                  <input
                    type="checkbox"
                    checked={createDraft.allowedModes?.includes(mode) ?? true}
                    onChange={(e) => setCreateDraft((previous) => ({
                      ...previous,
                      allowedModes: toggleMode(previous.allowedModes ?? ["plan", "edit", "autonomous"], mode, e.target.checked),
                    }))}
                  />
                  <span>{mode}</span>
                </CapabilityToggle>
              ))}
            </CapabilityGrid>
          </Section>

          <Section>
            <FieldLabel>Empfohlene interne Tools</FieldLabel>
            <CapabilityGrid>
              {toolCapabilities.map((tool) => (
                <CapabilityToggle key={tool.id}>
                  <input
                    type="checkbox"
                    checked={createDraft.recommendedToolIds?.includes(tool.id) ?? false}
                    onChange={(e) => setCreateDraft((previous) => ({
                      ...previous,
                      recommendedToolIds: toggleEntry(previous.recommendedToolIds ?? [], tool.id, e.target.checked),
                    }))}
                  />
                  <span>{tool.name}</span>
                </CapabilityToggle>
              ))}
            </CapabilityGrid>
          </Section>

          <Section>
            <FieldLabel>Empfohlene MCPs</FieldLabel>
            <CapabilityGrid>
              {mcpCapabilities.map((mcp) => (
                <CapabilityToggle key={mcp.id}>
                  <input
                    type="checkbox"
                    checked={createDraft.recommendedMcpIds?.includes(mcp.id) ?? false}
                    onChange={(e) => setCreateDraft((previous) => ({
                      ...previous,
                      recommendedMcpIds: toggleEntry(previous.recommendedMcpIds ?? [], mcp.id, e.target.checked),
                    }))}
                  />
                  <span>{mcp.name}</span>
                </CapabilityToggle>
              ))}
            </CapabilityGrid>
          </Section>

          <ActionsRow>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? "Erstellt..." : "Skill erstellen"}
            </Button>
          </ActionsRow>
        </Card>

        {sortedSkills.length === 0 ? (
          <EmptyHint>Keine Skills vorhanden.</EmptyHint>
        ) : (
          <Grid>
            {sortedSkills.map((skill) => {
              const draft = editDrafts[skill.id] ?? EMPTY_DRAFT;
              const usage = usageBySkillId.get(skill.id);
              return (
                <Card key={skill.id}>
                  <SectionTitle>{SKILL_EMOJI} {skill.name}</SectionTitle>
                  <MutedText>{skill.description}</MutedText>

                  <SurfaceBox>
                    <strong>ID:</strong> {skill.id}
                  </SurfaceBox>
                  <SurfaceBox>
                    <strong>Pfad:</strong> {skill.path}
                  </SurfaceBox>
                  {usage && (usage.tools.length > 0 || usage.mcps.length > 0) ? (
                    <SurfaceBox>
                      <strong>Verknuepft mit:</strong>{" "}
                      {[...usage.tools, ...usage.mcps].join(", ")}
                    </SurfaceBox>
                  ) : null}

                  <FormField>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={draft.name}
                      onChange={(e) => setEditDrafts((previous) => ({
                        ...previous,
                        [skill.id]: { ...draft, name: e.target.value },
                      }))}
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Kurzbeschreibung</FieldLabel>
                    <Input
                      value={draft.description}
                      onChange={(e) => setEditDrafts((previous) => ({
                        ...previous,
                        [skill.id]: { ...draft, description: e.target.value },
                      }))}
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Instruction</FieldLabel>
                    <TextArea
                      rows={8}
                      value={draft.instruction}
                      onChange={(e) => setEditDrafts((previous) => ({
                        ...previous,
                        [skill.id]: { ...draft, instruction: e.target.value },
                      }))}
                    />
                  </FormField>

                  <ToggleRow>
                    <input
                      type="checkbox"
                      checked={draft.active ?? true}
                      onChange={(e) => setEditDrafts((previous) => ({
                        ...previous,
                        [skill.id]: { ...draft, active: e.target.checked },
                      }))}
                    />
                    <span>{draft.active ? "aktiv" : "deaktiviert"}</span>
                  </ToggleRow>

                  <Section>
                    <FieldLabel>Modes</FieldLabel>
                    <CapabilityGrid>
                      {(["plan", "edit", "autonomous"] as ChatMode[]).map((mode) => (
                        <CapabilityToggle key={mode}>
                          <input
                            type="checkbox"
                            checked={draft.allowedModes?.includes(mode) ?? true}
                            onChange={(e) => setEditDrafts((previous) => ({
                              ...previous,
                              [skill.id]: {
                                ...draft,
                                allowedModes: toggleMode(draft.allowedModes ?? ["plan", "edit", "autonomous"], mode, e.target.checked),
                              },
                            }))}
                          />
                          <span>{mode}</span>
                        </CapabilityToggle>
                      ))}
                    </CapabilityGrid>
                  </Section>

                  <Section>
                    <FieldLabel>Empfohlene interne Tools</FieldLabel>
                    <CapabilityGrid>
                      {toolCapabilities.map((tool) => (
                        <CapabilityToggle key={tool.id}>
                          <input
                            type="checkbox"
                            checked={draft.recommendedToolIds?.includes(tool.id) ?? false}
                            onChange={(e) => setEditDrafts((previous) => ({
                              ...previous,
                              [skill.id]: {
                                ...draft,
                                recommendedToolIds: toggleEntry(draft.recommendedToolIds ?? [], tool.id, e.target.checked),
                              },
                            }))}
                          />
                          <span>{tool.name}</span>
                        </CapabilityToggle>
                      ))}
                    </CapabilityGrid>
                  </Section>

                  <Section>
                    <FieldLabel>Empfohlene MCPs</FieldLabel>
                    <CapabilityGrid>
                      {mcpCapabilities.map((mcp) => (
                        <CapabilityToggle key={mcp.id}>
                          <input
                            type="checkbox"
                            checked={draft.recommendedMcpIds?.includes(mcp.id) ?? false}
                            onChange={(e) => setEditDrafts((previous) => ({
                              ...previous,
                              [skill.id]: {
                                ...draft,
                                recommendedMcpIds: toggleEntry(draft.recommendedMcpIds ?? [], mcp.id, e.target.checked),
                              },
                            }))}
                          />
                          <span>{mcp.name}</span>
                        </CapabilityToggle>
                      ))}
                    </CapabilityGrid>
                  </Section>

                  <ActionsRow>
                    <Button onClick={() => void handleSave(skill.id)} disabled={savingId === skill.id}>
                      {savingId === skill.id ? "Speichert..." : "Speichern"}
                    </Button>
                    <Button variant="danger" onClick={() => void handleDelete(skill.id)} disabled={savingId === skill.id}>
                      Loeschen
                    </Button>
                  </ActionsRow>
                </Card>
              );
            })}
          </Grid>
        )}
      </PageStack>
    </>
  );
}
