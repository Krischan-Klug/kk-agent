import { tools as toolsApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { McpListItem } from "@/types/api";
import { useMcpCardCollection } from "@/hooks/useMcpCardCollection";
import SettingsLayout from "@/components/SettingsLayout";
import McpCard from "@/components/mcp/McpCard";
import McpCardList from "@/components/mcp/McpCardList";
import { EmptyHint } from "@/components/PageForm";
import { buildMcpCardBaseProps } from "@/components/mcp/cardProps";
import { buildSystemToolUpdateBody } from "@/components/mcp/updateBody";

export default function SettingsToolsPage() {
  const collection = useMcpCardCollection(toolsApi, "tools");

  async function handleStateToggle(tool: McpListItem) {
    try {
      await toolsApi.update(tool.id, { active: !tool.active });
      await collection.loadItems();
    } catch (err) {
      reportError("Failed to toggle tool", err);
    }
  }

  async function handleSaveEdit(tool: McpListItem) {
    const form = collection.editForms[tool.id];
    if (!form) return;

    try {
      await toolsApi.update(tool.id, {
        ...buildSystemToolUpdateBody(tool, form),
        instruction: collection.instructions[tool.id] ?? "",
      });
      collection.expandedEdit.remove(tool.id);
      await collection.loadItems();
    } catch (err) {
      reportError("Failed to save tool edit", err);
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
            onStateToggle={() => void handleStateToggle(tool)}
            onSaveEdit={() => void handleSaveEdit(tool)}
          />
        ))}
        {collection.items.length === 0 && <EmptyHint>No internal tools found.</EmptyHint>}
      </McpCardList>
    </SettingsLayout>
  );
}
