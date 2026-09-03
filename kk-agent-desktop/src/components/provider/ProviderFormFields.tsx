import Input from "@/components/Input";
import { FieldLabel, FormField } from "@/components/PageForm";

export type ProviderFormValue = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

type Props = {
  value: ProviderFormValue;
  onChange: (value: ProviderFormValue) => void;
  autoFocus?: boolean;
};

export default function ProviderFormFields({
  value,
  onChange,
  autoFocus,
}: Props) {
  const set = (field: keyof ProviderFormValue, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

  return (
    <>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. OpenAI-compatible Server"
          autoFocus={autoFocus}
        />
      </FormField>
      <FormField>
        <FieldLabel>Base URL</FieldLabel>
        <Input
          value={value.baseUrl}
          onChange={(e) => set("baseUrl", e.target.value)}
        />
      </FormField>
      <FormField>
        <FieldLabel>API Key</FieldLabel>
        <Input
          type="password"
          value={value.apiKey}
          onChange={(e) => set("apiKey", e.target.value)}
          placeholder="optional"
        />
      </FormField>
    </>
  );
}
