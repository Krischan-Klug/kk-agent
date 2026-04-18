import TextArea from "@/components/TextArea";
import type { AgentPromptSections, AppDefaults } from "@/types/api";
import { FieldLabel, FormField } from "@/components/PageForm";

const PROMPT_SECTION_META: Array<{ key: keyof AgentPromptSections; label: string }> = [
  { key: "identity", label: "\u{1FAAA} Identity" },
  { key: "system", label: "\u{1F9E0} System" },
  { key: "runtime", label: "\u2699\uFE0F Runtime" },
  { key: "tasks", label: "\u{1F4DD} Tasks" },
  { key: "security", label: "\u{1F512} Security" },
  { key: "toolUsage", label: "\u{1F6E0}\uFE0F Tool Usage" },
  { key: "communication", label: "\u{1F4AC} Communication" },
];

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
