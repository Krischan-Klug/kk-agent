import styled from "styled-components";
import type { AuthMethod, ProviderType } from "@/types/api";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { FieldLabel, FormField } from "@/components/PageForm";
import { AUTH_OPTIONS, DEFAULT_BASE_URLS, PROVIDER_TYPES } from "./constants";

const Select = styled.select`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-sm);

  &:focus {
    border-color: var(--border-focus);
    outline: none;
  }
`;

type Props = {
  open: boolean;
  type: ProviderType;
  name: string;
  baseUrl: string;
  auth: AuthMethod;
  apiKey: string;
  onTypeChange: (value: ProviderType) => void;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onAuthChange: (value: AuthMethod) => void;
  onApiKeyChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateProviderModal(props: Props) {
  if (!props.open) return null;

  return (
    <Modal title="Neuer Provider" onClose={props.onClose}>
      <FormField>
        <FieldLabel>Typ</FieldLabel>
        <Select
          value={props.type}
          onChange={(e) => {
            const nextType = e.target.value as ProviderType;
            props.onTypeChange(nextType);
            props.onBaseUrlChange(DEFAULT_BASE_URLS[nextType]);
            props.onAuthChange(AUTH_OPTIONS[nextType][0].value);
            props.onNameChange(PROVIDER_TYPES.find((type) => type.value === nextType)?.label ?? "");
          }}
        >
          {PROVIDER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </Select>
      </FormField>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input value={props.name} onChange={(e) => props.onNameChange(e.target.value)} placeholder="z.B. Mein LM Studio" autoFocus />
      </FormField>
      <FormField>
        <FieldLabel>Base URL</FieldLabel>
        <Input value={props.baseUrl} onChange={(e) => props.onBaseUrlChange(e.target.value)} />
      </FormField>
      {props.type !== "lmstudio" && (
        <>
          <FormField>
            <FieldLabel>Auth</FieldLabel>
            <Select value={props.auth} onChange={(e) => props.onAuthChange(e.target.value as AuthMethod)}>
              {AUTH_OPTIONS[props.type].map((auth) => <option key={auth.value} value={auth.value}>{auth.label}</option>)}
            </Select>
          </FormField>
          {props.auth === "api-key" && (
            <FormField>
              <FieldLabel>API Key</FieldLabel>
              <Input type="password" value={props.apiKey} onChange={(e) => props.onApiKeyChange(e.target.value)} placeholder="sk-..." />
            </FormField>
          )}
        </>
      )}
      <Button onClick={props.onCreate} disabled={!props.name.trim()}>
        Erstellen
      </Button>
    </Modal>
  );
}
