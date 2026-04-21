import type { AppDefaults, ChatMode } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import { Select } from "@/components/settings/defaults.styled";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
  chatModes: ChatMode[];
}

export default function AgentCoreSection({ draft, setDraft, chatModes }: Props) {
  return (
    <FormRow>
      <FormField>
        <FieldLabel>Default Chat Mode</FieldLabel>
        <Select
          value={draft.agent.defaultChatMode}
          onChange={(e) => setDraft({
            ...draft,
            agent: { ...draft.agent, defaultChatMode: e.target.value as ChatMode },
          })}
        >
          {chatModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </Select>
      </FormField>
    </FormRow>
  );
}
