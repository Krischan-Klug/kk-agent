import { useState } from "react";
import FormModal from "@/components/FormModal";
import Select from "@/components/Select";
import { FieldLabel, FormField, MutedText } from "@/components/PageForm";
import type { SessionCreationContext } from "@/lib/sessionFactory";

type Props = {
  open: boolean;
  context: SessionCreationContext | null;
  creating?: boolean;
  onCreate: (providerId: string) => void;
  onClose: () => void;
};

type CreateSessionModalContentProps = {
  context: SessionCreationContext;
  creating: boolean;
  defaultProviderId: string;
  onCreate: (providerId: string) => void;
  onClose: () => void;
};

function CreateSessionModalContent({
  context,
  creating,
  defaultProviderId,
  onCreate,
  onClose,
}: CreateSessionModalContentProps) {
  const [providerId, setProviderId] = useState(defaultProviderId);

  return (
    <FormModal
      title="Provider fuer neue Session waehlen"
      onClose={onClose}
      onSubmit={() => onCreate(providerId)}
      submitDisabled={!providerId}
      submitting={creating}
      submitLabel={creating ? "Erstellt..." : "Session erstellen"}
    >
      <FormField>
        <FieldLabel>Agent</FieldLabel>
        <MutedText>{context.agent.name}</MutedText>
      </FormField>
      <FormField>
        <FieldLabel htmlFor="session-provider-select">Provider</FieldLabel>
        <Select
          id="session-provider-select"
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
          autoFocus
        >
          <option value="" disabled>Provider auswaehlen</option>
          {context.providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </Select>
      </FormField>
    </FormModal>
  );
}

export default function CreateSessionModal({ open, context, creating = false, onCreate, onClose }: Props) {
  if (!open || !context) return null;

  const defaultProviderId = context.selectedProviderId ?? context.providers[0]?.id ?? "";
  const contextKey = `${context.agent.id}:${defaultProviderId}:${context.providers.map((provider) => provider.id).join(",")}`;

  return (
    <CreateSessionModalContent
      key={contextKey}
      context={context}
      creating={creating}
      defaultProviderId={defaultProviderId}
      onCreate={onCreate}
      onClose={onClose}
    />
  );
}
