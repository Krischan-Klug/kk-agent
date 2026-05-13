import type { McpListItem } from "@/types/api";
import type { McpCardCollection } from "@/hooks/useMcpCardCollection";
import type { EditForm } from "./types";

export function buildMcpCardBaseProps(item: McpListItem, collection: McpCardCollection) {
  return {
    instruction: collection.instructions[item.id] ?? "",
    editForm: collection.editForms[item.id],
    editOpen: collection.expandedEdit.has(item.id),
    toolsOpen: collection.expandedTools.has(item.id),
    instructionsOpen: collection.expandedInstructions.has(item.id),
    onEditToggle: () => collection.expandedEdit.toggle(item.id),
    onInstructionToggle: () => collection.expandedInstructions.toggle(item.id),
    onInstructionChange: (value: string) => collection.setInstructions((prev) => ({ ...prev, [item.id]: value })),
    onInstructionSave: () => void collection.handleSaveInstruction(item.id),
    onToolsToggle: () => collection.expandedTools.toggle(item.id),
    onOpenEdit: () => collection.openEdit(item),
    onEditFormChange: (form: EditForm) => collection.setEditForms((prev) => ({ ...prev, [item.id]: form })),
    availableSkills: collection.skillOptions,
    onSkillToggle: (skillId: string, linked: boolean) => void collection.handleSkillToggle(item, skillId, linked),
    systemVariables: collection.systemVariables,
  };
}
