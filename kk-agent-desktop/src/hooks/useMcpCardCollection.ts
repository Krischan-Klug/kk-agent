import { useCallback, useEffect, useState } from "react";
import { agent as agentApi } from "@/lib/api";
import type { Logger } from "@/lib/logger";
import type { McpListItem, UpdateMcpBody } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { buildEditForm, type EditForm } from "@/components/mcp/types";

type McpCardCollectionApi = {
  list: () => Promise<McpListItem[]>;
  update: (id: string, body: UpdateMcpBody) => Promise<unknown>;
};

export type McpCardCollection = ReturnType<typeof useMcpCardCollection>;

export function useMcpCardCollection(api: McpCardCollectionApi, logger: Logger, label: string) {
  const [items, setItems] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const expandedTools = useToggleSet();
  const expandedInstructions = useToggleSet();
  const expandedEdit = useToggleSet();

  const loadItems = useCallback(async () => {
    try {
      const data = await api.list();
      setItems(data);
      setInstructions(Object.fromEntries(data.map((item) => [item.id, item.instruction])));
    } catch (err) {
      logger.error(`Failed to load ${label}:`, err);
    } finally {
      setLoading(false);
    }
  }, [api, label, logger]);

  const loadSystemVariables = useCallback(async () => {
    try {
      const response = await agentApi.systemVariables();
      setSystemVariables(response.variables);
    } catch (err) {
      logger.error("Failed to load system variables:", err);
    }
  }, [logger]);

  useEffect(() => {
    void loadItems();
    void loadSystemVariables();
  }, [loadItems, loadSystemVariables]);

  const openEdit = useCallback((item: McpListItem) => {
    setEditForms((prev) => ({ ...prev, [item.id]: buildEditForm(item) }));
    expandedEdit.add(item.id);
  }, [expandedEdit]);

  const handleSaveInstruction = useCallback(async (id: string) => {
    try {
      await api.update(id, { instruction: instructions[id] ?? "" });
      await loadItems();
    } catch (err) {
      logger.error("Failed to save instruction:", err);
    }
  }, [api, instructions, loadItems, logger]);

  return {
    items,
    loading,
    instructions,
    setInstructions,
    editForms,
    setEditForms,
    systemVariables,
    expandedTools,
    expandedInstructions,
    expandedEdit,
    loadItems,
    openEdit,
    handleSaveInstruction,
  };
}
