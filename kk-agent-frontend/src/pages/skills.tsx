import { useEffect, useMemo, useState } from "react";
import { mcp as mcpApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import type { McpListItem, SkillDefinition } from "@/types/api";
import { PageBody } from "@/components/Layout.styled";
import { MasterDetailLayout } from "@/components/MasterDetail.styled";
import Spinner from "@/components/Spinner";
import CreateSkillModal from "@/components/skill/CreateSkillModal";
import SkillEditor, {
  EMPTY_SKILL_DRAFT,
  skillToDraft,
  toCreateBody,
  toUpdateBody,
  type SkillDraft,
} from "@/components/skill/SkillEditor";
import SkillList from "@/components/skill/SkillList";

function buildDraftMap(skillList: SkillDefinition[]): Record<string, SkillDraft> {
  return Object.fromEntries(skillList.map((skill) => [skill.id, skillToDraft(skill)]));
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [toolCapabilities, setToolCapabilities] = useState<McpListItem[]>([]);
  const [mcpCapabilities, setMcpCapabilities] = useState<McpListItem[]>([]);
  const [editDrafts, setEditDrafts] = useState<Record<string, SkillDraft>>({});
  const [createDraft, setCreateDraft] = useState<SkillDraft | null>(null);

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

  const selectedSkill = createDraft ? null : sortedSkills.find((skill) => skill.id === selectedId) ?? null;
  const activeDraft = createDraft ?? (selectedSkill ? editDrafts[selectedSkill.id] ?? skillToDraft(selectedSkill) : null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll(nextSelectedId?: string | null) {
    try {
      const [skillList, toolList, mcpList] = await Promise.all([
        skillsApi.list(),
        toolsApi.list(),
        mcpApi.list(),
      ]);

      const sorted = [...skillList].sort((left, right) => left.name.localeCompare(right.name));
      setSkills(sorted);
      setToolCapabilities(toolList);
      setMcpCapabilities(mcpList);
      setEditDrafts(buildDraftMap(sorted));

      if (createDraft) return;
      if (sorted.length === 0) {
        setSelectedId(null);
        return;
      }

      const desiredId = nextSelectedId === undefined ? selectedId : nextSelectedId;
      if (desiredId && sorted.some((skill) => skill.id === desiredId)) {
        setSelectedId(desiredId);
        return;
      }

      setSelectedId(sorted[0].id);
    } catch (err) {
      console.error("[skills-load]", err);
    } finally {
      setLoading(false);
    }
  }

  function selectSkill(id: string) {
    setCreateDraft(null);
    setSelectedId(id);
  }

  function handleDraftChange(nextDraft: SkillDraft) {
    if (createDraft) {
      setCreateDraft(nextDraft);
      return;
    }

    if (!selectedSkill) return;
    setEditDrafts((previous) => ({
      ...previous,
      [selectedSkill.id]: nextDraft,
    }));
  }

  function startCreate() {
    const trimmedName = newName.trim();
    setCreateDraft({
      ...EMPTY_SKILL_DRAFT,
      name: trimmedName,
    });
    setSelectedId(null);
    setShowCreate(false);
    setNewName("");
  }

  async function handleSave() {
    if (!activeDraft) return;

    setSaving(true);
    try {
      if (createDraft) {
        const created = await skillsApi.create(toCreateBody(createDraft));
        setCreateDraft(null);
        await loadAll(created.id);
        return;
      }

      if (!selectedSkill) return;
      await skillsApi.update(selectedSkill.id, toUpdateBody(activeDraft));
      await loadAll(selectedSkill.id);
    } catch (err) {
      console.error(createDraft ? "[skills-create]" : "[skills-save]", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedSkill) return;

    setSaving(true);
    try {
      await skillsApi.delete(selectedSkill.id);
      await loadAll(null);
    } catch (err) {
      console.error("[skills-delete]", err);
    } finally {
      setSaving(false);
    }
  }

  function cancelCreate() {
    setCreateDraft(null);
    if (sortedSkills.length > 0) {
      setSelectedId(sortedSkills[0].id);
    }
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <MasterDetailLayout>
        <SkillList
          skills={sortedSkills}
          selectedId={selectedId}
          createDraftName={createDraft?.name}
          usageBySkillId={usageBySkillId}
          onSelect={selectSkill}
          onCreate={() => setShowCreate(true)}
        />
        <SkillEditor
          skill={selectedSkill}
          draft={activeDraft}
          isCreateMode={createDraft !== null}
          saving={saving}
          toolCapabilities={toolCapabilities}
          mcpCapabilities={mcpCapabilities}
          usage={selectedSkill ? usageBySkillId.get(selectedSkill.id) : undefined}
          onChange={handleDraftChange}
          onSave={() => void handleSave()}
          onDelete={() => void handleDelete()}
          onCancelCreate={cancelCreate}
        />
      </MasterDetailLayout>
      <CreateSkillModal
        open={showCreate}
        name={newName}
        onNameChange={setNewName}
        onCreate={startCreate}
        onClose={() => setShowCreate(false)}
      />
    </PageBody>
  );
}
