import { useState } from "react";
import styled from "styled-components";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ActionsRow, FieldLabel, FormField, MutedText } from "@/components/PageForm";
import { reportError } from "@/lib/errorReporting";

const CredentialRow = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 2fr);
  gap: var(--space-md);
  align-items: end;
`;

export type CredentialField = {
  id: string;
  credentialId: string;
  label: string;
  description?: string;
  required: boolean;
  configured: boolean;
};

type Props = {
  fields: CredentialField[];
  onChanged: () => void | Promise<void>;
};

export default function CredentialEditor({ fields, onChanged }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();

  async function save(field: CredentialField) {
    const value = values[field.id] ?? "";
    if (!value || !window.kkAgentDesktop?.credentials) return;
    setBusyId(field.id);
    try {
      await window.kkAgentDesktop.credentials.set(field.credentialId, value);
      setValues((current) => ({ ...current, [field.id]: "" }));
      await onChanged();
    } catch (error) {
      reportError(`Failed to save ${field.label}`, error);
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(field: CredentialField) {
    if (!window.kkAgentDesktop?.credentials) return;
    setBusyId(field.id);
    try {
      await window.kkAgentDesktop.credentials.remove(field.credentialId);
      setValues((current) => ({ ...current, [field.id]: "" }));
      await onChanged();
    } catch (error) {
      reportError(`Failed to remove ${field.label}`, error);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      {fields.map((field) => (
        <CredentialRow key={field.id}>
          <FormField>
            <FieldLabel>{field.label}{field.required ? " (required)" : " (optional)"}</FieldLabel>
            <MutedText>{field.description || (field.configured ? "Configured" : "Not configured")}</MutedText>
          </FormField>
          <FormField>
            <Input
              type="password"
              autoComplete="off"
              value={values[field.id] ?? ""}
              placeholder={field.configured ? "Configured — enter to replace" : "Enter credential"}
              onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
            />
            <ActionsRow>
              <Button
                size="sm"
                disabled={busyId === field.id || !(values[field.id] ?? "")}
                onClick={() => void save(field)}
              >
                {busyId === field.id ? "Saving..." : field.configured ? "Replace" : "Save"}
              </Button>
              {field.configured && (
                <Button size="sm" variant="secondary" disabled={busyId === field.id} onClick={() => void remove(field)}>
                  Remove
                </Button>
              )}
            </ActionsRow>
          </FormField>
        </CredentialRow>
      ))}
    </>
  );
}
