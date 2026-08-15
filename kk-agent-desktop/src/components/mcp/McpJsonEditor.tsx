import styled from "styled-components";
import TextArea from "@/components/TextArea";
import { FieldLabel, FormField, MutedText } from "@/components/PageForm";

const JsonTextArea = styled(TextArea)`
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
`;

const ErrorText = styled.p`
  margin: 0;
  color: var(--danger);
  font-size: var(--font-size-sm);
`;

type Props = {
  value: string;
  error?: string;
  hint: string;
  placeholder?: string;
  rows?: number;
  label?: string;
  onChange: (value: string) => void;
};

export default function McpJsonEditor({ value, error, hint, placeholder, rows = 12, label = "MCP JSON", onChange }: Props) {
  return (
    <FormField>
      <FieldLabel>{label}</FieldLabel>
      <MutedText>{hint}</MutedText>
      <JsonTextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        aria-invalid={Boolean(error)}
      />
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </FormField>
  );
}
