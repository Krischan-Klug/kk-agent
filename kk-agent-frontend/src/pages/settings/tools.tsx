import { tools as toolsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { McpListItem } from "@/types/api";
import { useMcpCardCollection } from "@/hooks/useMcpCardCollection";
import SettingsLayout from "@/components/SettingsLayout";
import McpCard from "@/components/mcp/McpCard";
import McpCardList from "@/components/mcp/McpCardList";
import { EmptyHint } from "@/components/PageForm";
import { buildMcpCardBaseProps } from "@/components/mcp/cardProps";
import { buildSystemToolUpdateBody } from "@/components/mcp/updateBody";

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

    try {
      await Promise.all([
        toolsApi.update(tool.id, buildSystemToolUpdateBody(tool, form)),
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
            {...buildMcpCardBaseProps(tool, collection)}
            hideMcpMetadata
            showConfigDetail={false}
            compactHeader
            showInstructionControls={false}
            showToolsControls={false}
            showInstructionInEdit
            onStateToggle={() => void handleStateToggle(tool)}
            onDelete={() => undefined}
            onSaveEdit={() => void handleSaveEdit(tool)}
          />
        ))}
        {collection.items.length === 0 && <EmptyHint>No internal tools found.</EmptyHint>}
      </McpCardList>
    </SettingsLayout>
  );
}
