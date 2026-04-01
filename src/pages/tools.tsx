import { useEffect, useState } from "react";
import styled from "styled-components";
import { tools as toolsApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { McpListItem } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { PageTitle } from "@/components/Layout.styled";
import Spinner from "@/components/Spinner";
import McpCard from "@/components/mcp/McpCard";
import { EmptyHint } from "@/components/PageForm";
import { buildEditForm, type EditForm } from "@/components/mcp/types";

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
`;

export default function ToolsPage() {
  const [toolMcps, setToolMcps] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const expandedTools = useToggleSet();
  const expandedInstructions = useToggleSet();
  const expandedEdit = useToggleSet();

  useEffect(() => {
    void loadTools();
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

    try {
      await toolsApi.update(tool.id, {
        name: form.name,
        emoji: form.emoji || undefined,
        systemConfig: {
          ...(tool.systemKey === "filesystem" ? { rootPath: form.rootPath } : {}),
          ...(tool.systemKey === "terminal" ? { workingDirectory: form.workingDirectory } : {}),
        },
      });
      expandedEdit.remove(tool.id);
      await loadTools();
    } catch (err) {
      logUiError("tools-save-edit", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageTitle>Tools</PageTitle>
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
          />
        ))}
        {toolMcps.length === 0 && <EmptyHint>Keine internen Tools gefunden.</EmptyHint>}
      </Grid>
    </>
  );
}
