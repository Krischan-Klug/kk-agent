import TextArea from "@/components/TextArea";
import type { AppDefaults, ModeBehavior } from "@/types/api";
import { FieldLabel, FormField } from "@/components/PageForm";
import AutonomousBudgetFields from "@/components/AutonomousBudgetFields";
import ModeTabsSelector from "./ModeTabsSelector";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ModeBehavior[];
  selectedMode: ModeBehavior;
  setSelectedMode: (mode: ModeBehavior) => void;
}

export default function ModeInstructionsSection({
  draft,
  setDraft,
  chatModes,
  selectedMode,
  setSelectedMode,
}: Props) {
  const template = draft.agent.modeTemplates[selectedMode];
  const budget = template?.autonomousBudget ?? {};

  function updateBudget(partial: Partial<typeof budget>) {
    setDraft({
      ...draft,
      agent: {
        ...draft.agent,
        modeTemplates: {
          ...draft.agent.modeTemplates,
          [selectedMode]: {
            ...template,
            autonomousBudget: { ...budget, ...partial },
          },
        },
      },
    });
  }

  return (
    <>
      <ModeTabsSelector modes={chatModes} selected={selectedMode} onSelect={setSelectedMode} />
      <FormField>
        <FieldLabel>{selectedMode}</FieldLabel>
        <TextArea
          rows={4}
          value={template.modeInstruction}
          onChange={(e) => setDraft({
            ...draft,
            agent: {
              ...draft.agent,
              modeTemplates: {
                ...draft.agent.modeTemplates,
                [selectedMode]: {
                  ...template,
                  modeInstruction: e.target.value,
                },
              },
            },
          })}
        />
      </FormField>
      {selectedMode === "autonomous" && (
        <AutonomousBudgetFields value={budget} onChange={updateBudget} full />
      )}
    </>
  );
}
