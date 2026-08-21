import Button from "@/components/Button";
import MarkdownMessage from "@/components/MarkdownMessage";
import {
  ChoiceButton,
  CustomInput,
  CustomInputRow,
  PromptCard,
  PromptKind,
  PromptQuestion,
} from "./ChatMessages.styled";
import type { PendingPrompt } from "./types";

type Props = {
  pendingPrompt: PendingPrompt;
  customAnswer: string;
  onCustomAnswerChange: (value: string) => void;
  onPromptResponse: (selectedKey: string) => void;
};

export default function PendingPromptCard({
  pendingPrompt,
  customAnswer,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  function submitCustomAnswer() {
    const answer = customAnswer.trim();
    if (!answer) return;
    onPromptResponse(answer);
    onCustomAnswerChange("");
  }

  return (
    <PromptCard $purpose={pendingPrompt.purpose}>
      <PromptKind>{pendingPrompt.purpose === "approval" ? "Freigabe" : "Nutzerfrage"}</PromptKind>
      <PromptQuestion>
        <MarkdownMessage content={pendingPrompt.question} />
      </PromptQuestion>
      {pendingPrompt.choices.map((choice) => (
        <ChoiceButton key={choice.key} onClick={() => onPromptResponse(choice.key)}>
          {choice.label}
        </ChoiceButton>
      ))}
      {pendingPrompt.purpose === "question" && (
        <CustomInputRow>
          <CustomInput
            value={customAnswer}
            onChange={(event) => onCustomAnswerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitCustomAnswer();
            }}
            placeholder="Oder eigene Antwort eingeben..."
          />
          <Button onClick={submitCustomAnswer} disabled={!customAnswer.trim()}>
            OK
          </Button>
        </CustomInputRow>
      )}
    </PromptCard>
  );
}
