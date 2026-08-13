import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import { FieldLabel, FormField } from "@/components/PageForm";

type Props = {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelsChange: (value: string) => void;
  autoFocus?: boolean;
};

export default function ProviderFormFields({
  name,
  baseUrl,
  apiKey,
  models,
  onNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onModelsChange,
  autoFocus,
}: Props) {
  return (
    <>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Local LLM Server"
          autoFocus={autoFocus}
        />
      </FormField>
      <FormField>
        <FieldLabel>Base URL</FieldLabel>
        <Input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
        />
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
      <FormField>
        <FieldLabel>Models (optional, eine ID pro Zeile)</FieldLabel>
        <TextArea
          value={models}
          onChange={(e) => onModelsChange(e.target.value)}
          placeholder={"e.g. glm-4.6\nglm-4.5"}
          rows={3}
        />
      </FormField>
    </>
  );
}
