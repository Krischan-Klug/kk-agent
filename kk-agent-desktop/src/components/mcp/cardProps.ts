import type { McpListItem } from "@/types/api";
import type { McpCardCollection } from "@/hooks/useMcpCardCollection";
import type { EditForm } from "./types";

export function buildMcpCardBaseProps(item: McpListItem, collection: McpCardCollection) {
  return {
    instruction: collection.instructions[item.id] ?? "",
    editForm: collection.editForms[item.id],
    editOpen: collection.expandedEdit.has(item.id),
    onEditToggle: () => collection.expandedEdit.toggle(item.id),
    onInstructionChange: (value: string) => collection.setInstructions((prev) => ({ ...prev, [item.id]: value })),
    onOpenEdit: () => collection.openEdit(item),
    onEditFormChange: (form: EditForm) => collection.setEditForms((prev) => ({ ...prev, [item.id]: form })),
    systemVariables: collection.systemVariables,
  };
}
