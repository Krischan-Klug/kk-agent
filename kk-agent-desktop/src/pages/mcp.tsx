import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { agent as agentApi, mcp as mcpApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { CreateMcpBody, McpListItem, UpdateMcpBody } from "kk-agent-contract";
import { PageBody } from "@/components/Layout.styled";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import McpCard from "@/components/mcp/McpCard";
import CreateMcpModal from "@/components/mcp/CreateMcpModal";
import { ActionsRow, EmptyHint, MutedText } from "@/components/PageForm";

const HeaderActions = styled.div`
  margin-bottom: var(--space-lg);
`;

const McpCardList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export default function McpPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [items, setItems] = useState<McpListItem[]>([]);
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => setItems(await mcpApi.list()), []);

  useEffect(() => {
    void loadItems()
      .catch((error) => reportError("Failed to load MCPs", error))
      .finally(() => setLoading(false));
    void agentApi.systemVariables()
      .then((response) => setSystemVariables(response.variables))
      .catch((error) => reportError("Failed to load system variables", error));
  }, [loadItems]);

  async function handleStateToggle(mcp: McpListItem) {
    await mcpApi.update(mcp.id, { active: !mcp.active });
    await loadItems();
  }

  async function handleCreate(createForm: CreateMcpBody) {
    setCreating(true);
    try {
      await mcpApi.create({
        name: createForm.name,
        transport: createForm.transport,
        emoji: createForm.emoji || undefined,
        command: createForm.transport === "stdio" ? createForm.command : undefined,
        args: createForm.transport === "stdio" && createForm.args?.length ? createForm.args : undefined,
        env: createForm.transport === "stdio" ? createForm.env : undefined,
        url: createForm.transport === "sse" ? createForm.url : undefined,
        instruction: createForm.instruction || undefined,
      });
      setShowCreate(false);
      await loadItems();
    } catch (err) {
      reportError("Failed to create MCP", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await mcpApi.remove(id);
      setDeleteTarget(null);
      await loadItems();
    } catch (err) {
      reportError("Failed to delete MCP", err);
    }
  }

  async function handleSave(id: string, body: UpdateMcpBody) {
    await mcpApi.update(id, body);
    await loadItems();
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <HeaderActions>
        <Button onClick={() => setShowCreate(true)}>Import MCP JSON</Button>
      </HeaderActions>
      <McpCardList>
        {items.map((mcp) => (
          <McpCard
            key={mcp.id}
            mcp={mcp}
            systemVariables={systemVariables}
            onStateToggle={() => handleStateToggle(mcp)}
            onDelete={() => setDeleteTarget(mcp.id)}
            onSave={(body) => handleSave(mcp.id, body)}
          />
        ))}
        {items.length === 0 && <EmptyHint>No external MCP servers configured.</EmptyHint>}
      </McpCardList>
      <CreateMcpModal
        open={showCreate}
        creating={creating}
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
