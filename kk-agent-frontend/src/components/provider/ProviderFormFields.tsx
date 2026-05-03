import Input from "@/components/Input";
import { FieldLabel, FormField } from "@/components/PageForm";

type Props = {
  name: string;
  baseUrl: string;
  apiKey: string;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  autoFocus?: boolean;
};

export default function ProviderFormFields({
  name,
  baseUrl,
  apiKey,
  onNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  autoFocus,
}: Props) {
  return (
    <>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="z.B. Lokaler LLM Server"
          autoFocus={autoFocus}
        />
      </FormField>
      <FormField>
        <FieldLabel>Base URL</FieldLabel>
        <Input value={baseUrl} onChange={(e) => onBaseUrlChange(e.target.value)} />
      </FormField>
      <FormField>
        <FieldLabel>API Key</FieldLabel>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="optional"
        />
      </FormField>
    </>
  );
}
