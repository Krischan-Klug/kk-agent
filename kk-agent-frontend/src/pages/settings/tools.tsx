import { tools as toolsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { McpListItem } from "@/types/api";
import { useMcpCardCollection } from "@/hooks/useMcpCardCollection";
import SettingsLayout from "@/components/SettingsLayout";
import McpCard from "@/components/mcp/McpCard";
import McpCardList from "@/components/mcp/McpCardList";
import { EmptyHint } from "@/components/PageForm";

const logger = createLogger("settings/tools");

export default function SettingsToolsPage() {
  const collection = useMcpCardCollection(toolsApi, logger, "tools");

  async function handleStateToggle(tool: McpListItem) {
    try {
      await toolsApi.toggle(tool.id, !tool.active);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to toggle tool:", err);
    }
  }

  async function handleSaveEdit(tool: McpListItem) {
    const form = collection.editForms[tool.id];
    if (!form) return;

    const previewThresholdChars = form.previewThresholdChars.trim() ? Number(form.previewThresholdChars) : undefined;
    const previewChars = form.previewChars.trim() ? Number(form.previewChars) : undefined;
    const resultPolicy = {
      ...(previewThresholdChars !== undefined ? { previewThresholdChars } : {}),
      ...(previewChars !== undefined ? { previewChars } : {}),
    };

    try {
      await Promise.all([
        toolsApi.update(tool.id, {
          name: form.name,
          emoji: form.emoji || undefined,
          systemConfig: {
            ...((tool.systemKey === "filesystem" || tool.systemKey === "terminal") ? { accessScope: form.accessScope } : {}),
            ...(tool.systemKey === "filesystem" ? { basePath: form.basePath } : {}),
            ...(tool.systemKey === "terminal" ? { workingDirectory: form.workingDirectory } : {}),
            ...((tool.systemKey === "filesystem" || tool.systemKey === "terminal" || tool.systemKey === "web-search")
              ? { resultPolicy }
              : {}),
          },
        }),
        toolsApi.setInstruction(tool.id, collection.instructions[tool.id] ?? ""),
      ]);
      collection.expandedEdit.remove(tool.id);
      await collection.loadItems();
    } catch (err) {
      logger.error("Failed to save tool edit:", err);
    }
  }

  return (
    <SettingsLayout loading={collection.loading}>
      <McpCardList>
        {collection.items.map((tool) => (
          <McpCard
            key={tool.id}
            mcp={tool}
            instruction={collection.instructions[tool.id] ?? ""}
            editForm={collection.editForms[tool.id]}
            editOpen={collection.expandedEdit.has(tool.id)}
            toolsOpen={collection.expandedTools.has(tool.id)}
            instructionsOpen={collection.expandedInstructions.has(tool.id)}
            hideMcpMetadata
            showConfigDetail={false}
            compactHeader
            showInstructionControls={false}
            showToolsControls={false}
            showInstructionInEdit
            systemVariables={collection.systemVariables}
            onStateToggle={() => void handleStateToggle(tool)}
            onEditToggle={() => collection.expandedEdit.toggle(tool.id)}
            onDelete={() => undefined}
            onInstructionToggle={() => collection.expandedInstructions.toggle(tool.id)}
            onInstructionChange={(value) => collection.setInstructions((prev) => ({ ...prev, [tool.id]: value }))}
            onInstructionSave={() => void collection.handleSaveInstruction(tool.id)}
            onToolsToggle={() => collection.expandedTools.toggle(tool.id)}
            onOpenEdit={() => collection.openEdit(tool)}
            onEditFormChange={(form) => collection.setEditForms((prev) => ({ ...prev, [tool.id]: form }))}
            onSaveEdit={() => void handleSaveEdit(tool)}
            availableSkills={collection.skillOptions}
            onSkillToggle={(skillId, linked) => void collection.handleSkillToggle(tool, skillId, linked)}
          />
        ))}
        {collection.items.length === 0 && <EmptyHint>Keine internen Tools gefunden.</EmptyHint>}
      </McpCardList>
    </SettingsLayout>
  );
}
