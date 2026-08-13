import Input from "@/components/Input";
import type { AppDefaults } from "@/types/api";
import { FieldLabel, FormField } from "@/components/PageForm";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
}

export default function ReasoningSection({ draft, setDraft }: Props) {
  return (
    <FormField>
      <FieldLabel>Default Reasoning Effort</FieldLabel>
      <Input
        value={draft.reasoning.defaultEffort}
        onChange={(e) => setDraft({
          ...draft,
          reasoning: { ...draft.reasoning, defaultEffort: e.target.value },
        })}
      />
    </FormField>
  );
}
