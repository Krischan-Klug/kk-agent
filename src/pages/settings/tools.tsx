import { useEffect, useState } from "react";
import styled from "styled-components";
import { skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { McpListItem, SkillDefinition } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import Spinner from "@/components/Spinner";
import SettingsLayout from "@/components/SettingsLayout";
import McpCard from "@/components/mcp/McpCard";
import { EmptyHint } from "@/components/PageForm";
import { buildEditForm, type EditForm } from "@/components/mcp/types";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);

  @media (max-width: 1400px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

export default function SettingsToolsPage() {
  const [toolMcps, setToolMcps] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [skillList, setSkillList] = useState<SkillDefinition[]>([]);
  const expandedTools = useToggleSet();
  const expandedInstructions = useToggleSet();
  const expandedEdit = useToggleSet();

  useEffect(() => {
    void loadTools();
    void loadSkills();
  }, []);

  async function loadTools() {
    try {
      const data = await toolsApi.list();
      setToolMcps(data);
      setInstructions(Object.fromEntries(data.map((tool) => [tool.id, tool.instruction])));
    } catch (err) {
      logUiError("tools-load", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSkills() {
    try {
      setSkillList(await skillsApi.list());
    } catch (err) {
      logUiError("tools-skills-load", err);
    }
  }

  async function handleSkillToggle(tool: McpListItem, skillId: string, linked: boolean) {
    const current = tool.skillIds ?? [];
    const next = linked
      ? [...new Set([...current, skillId])]
      : current.filter((id) => id !== skillId);
    try {
      await toolsApi.update(tool.id, { skillIds: next });
      await loadTools();
    } catch (err) {
      logUiError("tools-skill-toggle", err);
    }
  }

  function openEdit(tool: McpListItem) {
    setEditForms((prev) => ({ ...prev, [tool.id]: buildEditForm(tool) }));
    expandedEdit.add(tool.id);
  }

  async function handleStateToggle(tool: McpListItem) {
    try {
      await toolsApi.toggle(tool.id, !tool.active);
      await loadTools();
    } catch (err) {
      logUiError("tools-toggle", err);
    }
  }

  async function handleSaveInstruction(id: string) {
    try {
      await toolsApi.setInstruction(id, instructions[id] ?? "");
      await loadTools();
    } catch (err) {
      logUiError("tools-save-instruction", err);
    }
  }

  async function handleSaveEdit(tool: McpListItem) {
    const form = editForms[tool.id];
    if (!form) return;

    const previewThresholdChars = form.previewThresholdChars.trim() ? Number(form.previewThresholdChars) : undefined;
    const previewChars = form.previewChars.trim() ? Number(form.previewChars) : undefined;
    const resultPolicy = {
      ...(previewThresholdChars !== undefined ? { previewThresholdChars } : {}),
      ...(previewChars !== undefined ? { previewChars } : {}),
    };

    try {
      await toolsApi.update(tool.id, {
        name: form.name,
        emoji: form.emoji || undefined,
        systemConfig: {
          ...((tool.systemKey === "filesystem" || tool.systemKey === "terminal") ? { accessScope: form.accessScope } : {}),
          ...(tool.systemKey === "filesystem" ? { basePath: form.basePath } : {}),
          ...(tool.systemKey === "terminal" ? { workingDirectory: form.workingDirectory } : {}),
          ...((tool.systemKey === "filesystem" || tool.systemKey === "terminal" || tool.systemKey === "web-search")
            ? { resultPolicy }
            : {}),
        },
      });
      expandedEdit.remove(tool.id);
      await loadTools();
    } catch (err) {
      logUiError("tools-save-edit", err);
    }
  }

  return (
    <SettingsLayout>
      {loading ? (
        <Spinner />
      ) : (
        <Grid>
          {toolMcps.map((tool) => (
            <McpCard
              key={tool.id}
              mcp={tool}
              instruction={instructions[tool.id] ?? ""}
              editForm={editForms[tool.id]}
              editOpen={expandedEdit.has(tool.id)}
              toolsOpen={expandedTools.has(tool.id)}
              instructionsOpen={expandedInstructions.has(tool.id)}
              onStateToggle={() => void handleStateToggle(tool)}
              onEditToggle={() => expandedEdit.toggle(tool.id)}
              onDelete={() => undefined}
              onInstructionToggle={() => expandedInstructions.toggle(tool.id)}
              onInstructionChange={(value) => setInstructions((prev) => ({ ...prev, [tool.id]: value }))}
              onInstructionSave={() => void handleSaveInstruction(tool.id)}
              onToolsToggle={() => expandedTools.toggle(tool.id)}
              onOpenEdit={() => openEdit(tool)}
              onEditFormChange={(form) => setEditForms((prev) => ({ ...prev, [tool.id]: form }))}
              onSaveEdit={() => void handleSaveEdit(tool)}
              availableSkills={skillList.map((skill) => ({ id: skill.id, name: skill.name }))}
              onSkillToggle={(skillId, linked) => void handleSkillToggle(tool, skillId, linked)}
            />
          ))}
          {toolMcps.length === 0 && <EmptyHint>Keine internen Tools gefunden.</EmptyHint>}
        </Grid>
      )}
    </SettingsLayout>
  );
}
