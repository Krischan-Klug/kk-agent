import TextArea from "@/components/TextArea";
import type { AppDefaults } from "@/types/api";
import { FieldLabel, FormField } from "@/components/PageForm";
import { PROMPT_SECTION_META } from "@/lib/promptSections";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
}

export default function PromptSectionsEditor({ draft, setDraft }: Props) {
  return (
    <>
      {PROMPT_SECTION_META.map((entry) => (
        <FormField key={entry.key}>
          <FieldLabel>{entry.label}</FieldLabel>
          <TextArea
            rows={4}
            value={draft.agent.promptSections[entry.key]}
            onChange={(e) => setDraft({
              ...draft,
              agent: {
                ...draft.agent,
                promptSections: { ...draft.agent.promptSections, [entry.key]: e.target.value },
              },
            })}
          />
        </FormField>
      ))}
    </>
  );
}
