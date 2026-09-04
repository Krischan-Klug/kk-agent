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
import { extractImportedCredentials } from "@/components/mcp/credentialImport";

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
    const extracted = extractImportedCredentials(createForm);
    try {
      const credentials = window.kkAgentDesktop?.credentials;
      if (extracted.pending.length > 0 && !credentials) throw new Error("Secure desktop credential storage is unavailable.");
      if (extracted.pending.length > 0) {
        await credentials!.setMany(Object.fromEntries(extracted.pending.map((entry) => [entry.credentialId, entry.value])));
      }
      await mcpApi.create(extracted.body);
      setShowCreate(false);
      await loadItems();
    } catch (err) {
      const credentials = window.kkAgentDesktop?.credentials;
      if (credentials) {
        await credentials.removeMany(extracted.pending.map((pending) => pending.credentialId)).catch(() => undefined);
      }
      reportError("Failed to create MCP", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const credentialIds = items.find((item) => item.id === id)?.credentialBindings?.map((binding) => binding.credentialId) ?? [];
      await mcpApi.remove(id);
      if (credentialIds.length > 0) await window.kkAgentDesktop?.credentials.removeMany(credentialIds);
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
