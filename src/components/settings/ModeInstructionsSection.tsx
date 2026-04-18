import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import type { AppDefaults, ChatMode } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import ModeTabsSelector from "./ModeTabsSelector";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ChatMode[];
  selectedMode: ChatMode;
  setSelectedMode: (mode: ChatMode) => void;
}

export default function ModeInstructionsSection({
  draft,
  setDraft,
  chatModes,
  selectedMode,
  setSelectedMode,
}: Props) {
  const budget = draft.agent.modeAutonomousBudgets?.[selectedMode] ?? {};

  function updateBudget(partial: Partial<typeof budget>) {
    setDraft({
      ...draft,
      agent: {
        ...draft.agent,
        modeAutonomousBudgets: {
          ...draft.agent.modeAutonomousBudgets,
          [selectedMode]: { ...budget, ...partial },
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
          value={draft.agent.modeInstructions[selectedMode]}
          onChange={(e) => setDraft({
            ...draft,
            agent: {
              ...draft.agent,
              modeInstructions: { ...draft.agent.modeInstructions, [selectedMode]: e.target.value },
            },
          })}
        />
      </FormField>
      {selectedMode === "autonomous" && (
        <FormRow>
          <FormField style={{ minWidth: "180px" }}>
            <FieldLabel>Max Input Tokens</FieldLabel>
            <Input
              type="number"
              min={0}
              value={budget.maxInputTokens ?? ""}
              onChange={(e) => updateBudget({
                maxInputTokens: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </FormField>
          <FormField style={{ minWidth: "180px" }}>
            <FieldLabel>Max Output Tokens</FieldLabel>
            <Input
              type="number"
              min={0}
              value={budget.maxOutputTokens ?? ""}
              onChange={(e) => updateBudget({
                maxOutputTokens: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </FormField>
          <FormField style={{ minWidth: "180px" }}>
            <FieldLabel>Max Wall Clock Ms</FieldLabel>
            <Input
              type="number"
              min={0}
              value={budget.maxWallClockMs ?? ""}
              onChange={(e) => updateBudget({
                maxWallClockMs: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </FormField>
          <FormField style={{ minWidth: "180px" }}>
            <FieldLabel>Max Auto Continues</FieldLabel>
            <Input
              type="number"
              min={0}
              value={budget.maxConsecutiveAutoContinues ?? ""}
              onChange={(e) => updateBudget({
                maxConsecutiveAutoContinues: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </FormField>
        </FormRow>
      )}
    </>
  );
}
