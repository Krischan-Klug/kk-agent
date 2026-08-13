import TextArea from "@/components/TextArea";
import type { AppDefaults, ModeBehavior, McpListItem } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import ModeTabsSelector from "./ModeTabsSelector";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ModeBehavior[];
  selectedMode: ModeBehavior;
  setSelectedMode: (mode: ModeBehavior) => void;
  internalTools: McpListItem[];
}

export default function ModeToolInstructionsSection({
  draft,
  setDraft,
  chatModes,
  selectedMode,
  setSelectedMode,
  internalTools,
}: Props) {
  const template = draft.agent.modeTemplates[selectedMode];
  return (
    <>
      <ModeTabsSelector modes={chatModes} selected={selectedMode} onSelect={setSelectedMode} keyPrefix="tool-mode" />
      <FormRow>
        {internalTools.map((tool) => (
          <FormField key={`${selectedMode}-${tool.id}`} style={{ flex: "1 1 420px" }}>
            <FieldLabel>{tool.emoji ? `${tool.emoji} ` : ""}{tool.name}</FieldLabel>
            <TextArea
              rows={4}
              value={template.toolInstructions?.[tool.id] ?? ""}
              onChange={(e) => setDraft({
                ...draft,
                agent: {
                  ...draft.agent,
                  modeTemplates: {
                    ...draft.agent.modeTemplates,
                    [selectedMode]: {
                      ...template,
                      toolInstructions: {
                        ...template.toolInstructions,
                        [tool.id]: e.target.value,
                      },
                    },
                  },
                },
              })}
              placeholder={tool.instruction ?? ""}
            />
          </FormField>
        ))}
      </FormRow>
    </>
  );
}
