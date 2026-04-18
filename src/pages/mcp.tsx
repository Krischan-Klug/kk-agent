import { useEffect, useState } from "react";
import styled from "styled-components";
import { mcp as mcpApi, skills as skillsApi } from "@/lib/api";
import type { CreateMcpBody, McpListItem, SkillDefinition } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { PageTitle } from "@/components/Layout.styled";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import McpCard from "@/components/mcp/McpCard";
import CreateMcpModal from "@/components/mcp/CreateMcpModal";
import { ActionsRow, EmptyHint, MutedText } from "@/components/PageForm";
import { buildEditForm, EMPTY_MCP_FORM, type EditForm } from "@/components/mcp/types";

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

const HeaderActions = styled.div`
  margin-bottom: var(--space-lg);
`;

export default function McpPage() {
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMcpBody>(EMPTY_MCP_FORM);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [skillList, setSkillList] = useState<SkillDefinition[]>([]);
  const expandedTools = useToggleSet();
  const expandedInstructions = useToggleSet();
  const expandedEdit = useToggleSet();

  useEffect(() => {
    void loadMcps();
    void loadSkills();
  }, []);

  async function loadSkills() {
    try {
      setSkillList(await skillsApi.list());
    } catch (err) {
      console.error("[mcp-skills-load]", err);
    }
  }

  async function handleSkillToggle(mcp: McpListItem, skillId: string, linked: boolean) {
    const current = mcp.skillIds ?? [];
    const next = linked
      ? [...new Set([...current, skillId])]
      : current.filter((id) => id !== skillId);
    try {
      await mcpApi.update(mcp.id, { skillIds: next });
      await loadMcps();
    } catch (err) {
      console.error("[mcp-skill-toggle]", err);
    }
  }

  async function loadMcps() {
    try {
      const data = await mcpApi.list();
      setMcps(data);
      setInstructions(Object.fromEntries(data.map((mcp) => [mcp.id, mcp.instruction])));
    } catch (err) {
      console.error("[mcp-load]", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartStop(mcp: McpListItem) {
    try {
      if (mcp.source === "system") await mcpApi.toggle(mcp.id, !mcp.active);
      else if (mcp.running) await mcpApi.stop(mcp.id);
      else await mcpApi.start(mcp.id);
      await loadMcps();
    } catch (err) {
      console.error("[mcp-state-toggle]", err);
    }
  }

  async function handleSaveInstruction(id: string) {
    try {
      await mcpApi.setInstruction(id, instructions[id]);
      await loadMcps();
    } catch (err) {
      console.error("[mcp-save-instruction]", err);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const env = Object.keys(createForm.env ?? {}).length > 0 ? createForm.env : undefined;
      await mcpApi.create({
        name: createForm.name,
        transport: createForm.transport,
        emoji: createForm.emoji || undefined,
        command: createForm.transport === "stdio" ? createForm.command : undefined,
        args: createForm.transport === "stdio" && createForm.args?.length ? createForm.args : undefined,
        env: createForm.transport === "stdio" ? env : undefined,
        url: createForm.transport === "sse" ? createForm.url : undefined,
        instruction: createForm.instruction || undefined,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_MCP_FORM);
      await loadMcps();
    } catch (err) {
      console.error("[mcp-create]", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await mcpApi.remove(id);
      setDeleteTarget(null);
      await loadMcps();
    } catch (err) {
      console.error("[mcp-delete]", err);
    }
  }

  function openEdit(mcp: McpListItem) {
    setEditForms((prev) => ({ ...prev, [mcp.id]: buildEditForm(mcp) }));
    expandedEdit.add(mcp.id);
  }

  async function handleSaveEdit(mcp: McpListItem, restart?: boolean) {
    const form = editForms[mcp.id];
    if (!form) return;

    try {
      const env = Object.keys(form.env).length > 0 ? form.env : undefined;
      await mcpApi.update(mcp.id, {
        name: form.name,
        emoji: form.emoji || undefined,
        ...(mcp.source === "system"
          ? {
              systemConfig: {
                ...(mcp.systemKey === "filesystem" ? { basePath: form.basePath } : {}),
                ...(mcp.systemKey === "terminal" ? { workingDirectory: form.workingDirectory } : {}),
              },
            }
          : mcp.transport === "stdio"
            ? { command: form.command, args: form.args.split("\n").filter(Boolean), env }
            : { url: form.url }),
      });

      if (restart && mcp.source !== "system") {
        try {
          await mcpApi.stop(mcp.id);
        } catch {
          // ignore stopped
        }
        await mcpApi.start(mcp.id);
      }

      expandedEdit.remove(mcp.id);
      await loadMcps();
    } catch (err) {
      console.error("[mcp-save-edit]", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageTitle>MCP Server</PageTitle>
      <HeaderActions>
        <Button onClick={() => setShowCreate(true)}>MCP hinzufügen</Button>
      </HeaderActions>
      <Grid>
        {mcps.map((mcp) => (
          <McpCard
            key={mcp.id}
            mcp={mcp}
            instruction={instructions[mcp.id] ?? ""}
            editForm={editForms[mcp.id]}
            editOpen={expandedEdit.has(mcp.id)}
            toolsOpen={expandedTools.has(mcp.id)}
            instructionsOpen={expandedInstructions.has(mcp.id)}
            onStateToggle={() => void handleStartStop(mcp)}
            onEditToggle={() => expandedEdit.toggle(mcp.id)}
            onDelete={() => setDeleteTarget(mcp.id)}
            onInstructionToggle={() => expandedInstructions.toggle(mcp.id)}
            onInstructionChange={(value) => setInstructions((prev) => ({ ...prev, [mcp.id]: value }))}
            onInstructionSave={() => void handleSaveInstruction(mcp.id)}
            onToolsToggle={() => expandedTools.toggle(mcp.id)}
            onOpenEdit={() => openEdit(mcp)}
            onEditFormChange={(form) => setEditForms((prev) => ({ ...prev, [mcp.id]: form }))}
            onSaveEdit={(restart) => void handleSaveEdit(mcp, restart)}
            availableSkills={skillList.map((skill) => ({ id: skill.id, name: skill.name }))}
            onSkillToggle={(skillId, linked) => void handleSkillToggle(mcp, skillId, linked)}
          />
        ))}
        {mcps.length === 0 && <EmptyHint>Keine externen MCP Server konfiguriert.</EmptyHint>}
      </Grid>
      <CreateMcpModal
        open={showCreate}
        form={createForm}
        creating={creating}
        onChange={setCreateForm}
        onCreate={handleCreate}
        onClose={() => setShowCreate(false)}
      />
      {deleteTarget && (
        <Modal title="MCP löschen?" onClose={() => setDeleteTarget(null)}>
          <MutedText>
            Der MCP Server wird gestoppt und entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
          </MutedText>
          <ActionsRow>
            <Button variant="danger" onClick={() => void handleDelete(deleteTarget)}>
              Löschen
            </Button>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
          </ActionsRow>
        </Modal>
      )}
    </>
  );
}
