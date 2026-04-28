import { useCallback, useEffect, useState } from "react";
import { skills as skillsApi } from "@/lib/api";
import type { Logger } from "@/lib/logger";
import type { McpListItem, SkillDefinition, UpdateMcpBody } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { buildEditForm, type EditForm } from "@/components/mcp/types";

type McpCardCollectionApi = {
  list: () => Promise<McpListItem[]>;
  setInstruction: (id: string, instruction: string) => Promise<unknown>;
  update: (id: string, body: UpdateMcpBody) => Promise<unknown>;
};

export function useMcpCardCollection(api: McpCardCollectionApi, logger: Logger, label: string) {
  const [items, setItems] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [skillList, setSkillList] = useState<SkillDefinition[]>([]);
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

  const loadSkills = useCallback(async () => {
    try {
      setSkillList(await skillsApi.list());
    } catch (err) {
      logger.error("Failed to load skills:", err);
    }
  }, [logger]);

  useEffect(() => {
    void loadItems();
    void loadSkills();
  }, [loadItems, loadSkills]);

  const openEdit = useCallback((item: McpListItem) => {
    setEditForms((prev) => ({ ...prev, [item.id]: buildEditForm(item) }));
    expandedEdit.add(item.id);
  }, [expandedEdit]);

  const handleSkillToggle = useCallback(async (item: McpListItem, skillId: string, linked: boolean) => {
    const current = item.skillIds ?? [];
    const next = linked
      ? [...new Set([...current, skillId])]
      : current.filter((id) => id !== skillId);
    try {
      await api.update(item.id, { skillIds: next });
      await loadItems();
    } catch (err) {
      logger.error("Failed to toggle skill:", err);
    }
  }, [api, loadItems, logger]);

  const handleSaveInstruction = useCallback(async (id: string) => {
    try {
      await api.setInstruction(id, instructions[id] ?? "");
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
    skillOptions: skillList.map((skill) => ({ id: skill.id, name: skill.name })),
    expandedTools,
    expandedInstructions,
    expandedEdit,
    loadItems,
    openEdit,
    handleSkillToggle,
    handleSaveInstruction,
  };
}
