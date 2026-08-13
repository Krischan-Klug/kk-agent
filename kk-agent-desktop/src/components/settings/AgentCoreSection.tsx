import type { AppDefaults, ModeBehavior } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import { Select } from "@/components/settings/defaults.styled";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ModeBehavior[];
}

export default function AgentCoreSection({ draft, setDraft, chatModes }: Props) {
  return (
    <FormRow>
      <FormField>
        <FieldLabel>Default Chat Mode</FieldLabel>
        <Select
          value={draft.agent.defaultModeBehavior}
          onChange={(e) => setDraft({
            ...draft,
            agent: { ...draft.agent, defaultModeBehavior: e.target.value as ModeBehavior },
          })}
        >
          {chatModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </Select>
      </FormField>
    </FormRow>
  );
}
