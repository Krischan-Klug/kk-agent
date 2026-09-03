import { useCallback, useEffect, useState } from "react";
import { agent as agentApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { McpListItem } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { buildEditForm, type EditForm } from "@/components/mcp/types";

type McpCardCollectionApi = {
  list: () => Promise<McpListItem[]>;
};

export type McpCardCollection = ReturnType<typeof useMcpCardCollection>;

export function useMcpCardCollection(api: McpCardCollectionApi, label: string) {
  const [items, setItems] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const expandedEdit = useToggleSet();

  const loadItems = useCallback(async () => {
    try {
      const data = await api.list();
      setItems(data);
      setInstructions(Object.fromEntries(data.map((item) => [item.id, item.instruction])));
    } catch (err) {
      reportError(`Failed to load ${label}`, err);
    } finally {
      setLoading(false);
    }
  }, [api, label]);

  const loadSystemVariables = useCallback(async () => {
    try {
      const response = await agentApi.systemVariables();
      setSystemVariables(response.variables);
    } catch (err) {
      reportError("Failed to load system variables", err);
    }
  }, []);

  useEffect(() => {
    void loadItems();
    void loadSystemVariables();
  }, [loadItems, loadSystemVariables]);

  const openEdit = useCallback((item: McpListItem) => {
    setEditForms((prev) => ({ ...prev, [item.id]: buildEditForm(item) }));
    expandedEdit.add(item.id);
  }, [expandedEdit]);

  return {
    items,
    loading,
    instructions,
    setInstructions,
    editForms,
    setEditForms,
    systemVariables,
    expandedEdit,
    loadItems,
    openEdit,
  };
}
