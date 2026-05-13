import { useState } from "react";
import styled from "styled-components";
import { mcp as mcpApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { CreateMcpBody, McpListItem } from "@/types/api";
import { useMcpCardCollection } from "@/hooks/useMcpCardCollection";
import { PageBody } from "@/components/Layout.styled";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import McpCard from "@/components/mcp/McpCard";
import McpCardList from "@/components/mcp/McpCardList";
import CreateMcpModal from "@/components/mcp/CreateMcpModal";
import { ActionsRow, EmptyHint, MutedText } from "@/components/PageForm";
import { EMPTY_MCP_FORM } from "@/components/mcp/types";
import { buildMcpCardBaseProps } from "@/components/mcp/cardProps";
import { buildCustomMcpUpdateBody } from "@/components/mcp/updateBody";

const logger = createLogger("mcp");

const HeaderActions = styled.div`
  margin-bottom: var(--space-lg);
`;

export default function McpPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMcpBody>(EMPTY_MCP_FORM);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const collection = useMcpCardCollection(mcpApi, logger, "MCPs");

  async function handleStartStop(mcp: McpListItem) {
    try {
      if (mcp.source === "system") await mcpApi.toggle(mcp.id, !mcp.active);
      else if (mcp.running) await mcpApi.stop(mcp.id);
      else await mcpApi.start(mcp.id);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to toggle MCP state:", err);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      await mcpApi.create({
        name: createForm.name,
        transport: createForm.transport,
        emoji: createForm.emoji || undefined,
        command: createForm.transport === "stdio" ? createForm.command : undefined,
        args: createForm.transport === "stdio" && createForm.args?.length ? createForm.args : undefined,
        url: createForm.transport === "sse" ? createForm.url : undefined,
        instruction: createForm.instruction || undefined,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_MCP_FORM);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to create MCP:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await mcpApi.remove(id);
      setDeleteTarget(null);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to delete MCP:", err);
    }
  }

  async function handleSaveEdit(mcp: McpListItem, restart?: boolean) {
    const form = collection.editForms[mcp.id];
    if (!form) return;

    try {
      await Promise.all([
        mcpApi.update(mcp.id, buildCustomMcpUpdateBody(mcp, form)),
        mcpApi.setInstruction(mcp.id, collection.instructions[mcp.id] ?? ""),
      ]);

      if (restart && mcp.source !== "system") {
        try {
          await mcpApi.stop(mcp.id);
        } catch {
          // ignore stopped
        }
        await mcpApi.start(mcp.id);
      }

      collection.expandedEdit.remove(mcp.id);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to save MCP edit:", err);
    }
  }

  if (collection.loading) return <Spinner />;

  return (
    <PageBody>
      <HeaderActions>
        <Button onClick={() => setShowCreate(true)}>Add MCP</Button>
      </HeaderActions>
      <McpCardList>
        {collection.items.map((mcp) => (
          <McpCard
            key={mcp.id}
            mcp={mcp}
            {...buildMcpCardBaseProps(mcp, collection)}
            hideMcpMetadata
            showConfigDetail={false}
            compactHeader
            showDeleteButton={false}
            showDeleteInEdit
            showInstructionControls={false}
            showToolsControls={false}
            showInstructionInEdit
            onStateToggle={() => void handleStartStop(mcp)}
            onDelete={() => setDeleteTarget(mcp.id)}
            onSaveEdit={(restart) => void handleSaveEdit(mcp, restart)}
          />
        ))}
        {collection.items.length === 0 && <EmptyHint>No external MCP servers configured.</EmptyHint>}
      </McpCardList>
      <CreateMcpModal
        open={showCreate}
        form={createForm}
        creating={creating}
        systemVariables={collection.systemVariables}
        onChange={setCreateForm}
        onCreate={handleCreate}
        onClose={() => setShowCreate(false)}
      />
      {deleteTarget && (
        <Modal title="Delete MCP?" onClose={() => setDeleteTarget(null)}>
          <MutedText>
            The MCP server will be stopped and removed. This action cannot be undone.
          </MutedText>
          <ActionsRow>
            <Button variant="danger" onClick={() => void handleDelete(deleteTarget)}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
          </ActionsRow>
        </Modal>
      )}
    </PageBody>
  );
}
