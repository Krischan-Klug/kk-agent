import TextArea from "@/components/TextArea";
import type { AppDefaults, ChatMode, McpListItem } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import ModeTabsSelector from "./ModeTabsSelector";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ChatMode[];
  selectedMode: ChatMode;
  setSelectedMode: (mode: ChatMode) => void;
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
  return (
    <>
      <ModeTabsSelector modes={chatModes} selected={selectedMode} onSelect={setSelectedMode} keyPrefix="tool-mode" />
      <FormRow>
        {internalTools.map((tool) => (
          <FormField key={`${selectedMode}-${tool.id}`} style={{ flex: "1 1 420px" }}>
            <FieldLabel>{tool.emoji ? `${tool.emoji} ` : ""}{tool.name}</FieldLabel>
            <TextArea
              rows={4}
              value={draft.agent.modeToolInstructions[selectedMode]?.[tool.id] ?? ""}
              onChange={(e) => setDraft({
                ...draft,
                agent: {
                  ...draft.agent,
                  modeToolInstructions: {
                    ...draft.agent.modeToolInstructions,
                    [selectedMode]: {
                      ...draft.agent.modeToolInstructions[selectedMode],
                      [tool.id]: e.target.value,
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
