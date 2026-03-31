import Modal from "@/components/Modal";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import Spinner from "@/components/Spinner";
import KeyValueEditor from "@/components/KeyValueEditor";
import { ActionsRow, FieldLabel, FormField, FormRow } from "@/components/PageForm";
import type { CreateMcpBody } from "@/types/api";

import styled from "styled-components";

const TransportTabs = styled.div`
  display: flex;
  gap: var(--space-xs);
`;

const TransportTab = styled.button<{ $active?: boolean }>`
  padding: 6px 16px;
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "var(--bg-elevated)")};
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);

  &:hover {
    border-color: var(--accent);
  }
`;

type Props = {
  open: boolean;
  form: CreateMcpBody;
  creating: boolean;
  onChange: (form: CreateMcpBody) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateMcpModal({ open, form, creating, onChange, onCreate, onClose }: Props) {
  if (!open) return null;

  return (
    <Modal title="MCP Server hinzufügen" onClose={onClose}>
      <FormField>
        <FormRow>
          <FormField $flex={1}>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="z.B. Filesystem"
            />
          </FormField>
          <FormField>
            <FieldLabel>Emoji</FieldLabel>
            <Input
              value={form.emoji ?? ""}
              onChange={(e) => onChange({ ...form, emoji: e.target.value })}
              placeholder="???"
              style={{ width: 60, textAlign: "center", fontSize: "1.2em" }}
            />
          </FormField>
        </FormRow>
      </FormField>
      <FormField>
        <FieldLabel>Transport</FieldLabel>
        <TransportTabs>
          <TransportTab $active={form.transport === "stdio"} onClick={() => onChange({ ...form, transport: "stdio" })}>
            stdio
          </TransportTab>
          <TransportTab $active={form.transport === "sse"} onClick={() => onChange({ ...form, transport: "sse" })}>
            sse
          </TransportTab>
        </TransportTabs>
      </FormField>
      {form.transport === "stdio" ? (
        <>
          <FormField>
            <FieldLabel>Command</FieldLabel>
            <Input
              value={form.command ?? ""}
              onChange={(e) => onChange({ ...form, command: e.target.value })}
              placeholder="z.B. npx"
            />
          </FormField>
          <FormField>
            <FieldLabel>Args (ein Argument pro Zeile)</FieldLabel>
            <TextArea
              value={(form.args ?? []).join("\n")}
              onChange={(e) => onChange({ ...form, args: e.target.value.split("\n").filter(Boolean) })}
              rows={4}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
            />
          </FormField>
          <FormField>
            <FieldLabel>Umgebungsvariablen</FieldLabel>
            <KeyValueEditor
              values={form.env ?? {}}
              onChange={(env) => onChange({ ...form, env })}
            />
          </FormField>
        </>
      ) : (
        <FormField>
          <FieldLabel>URL</FieldLabel>
          <Input
            value={form.url ?? ""}
            onChange={(e) => onChange({ ...form, url: e.target.value })}
            placeholder="http://localhost:3002/sse"
          />
        </FormField>
      )}
      <FormField>
        <FieldLabel>Instruction (optional)</FieldLabel>
        <TextArea
          value={form.instruction ?? ""}
          onChange={(e) => onChange({ ...form, instruction: e.target.value })}
          rows={4}
          placeholder="System-Instruction für diesen MCP..."
        />
      </FormField>
      <ActionsRow>
        <Button onClick={onCreate} disabled={creating || !form.name}>
          {creating ? <Spinner size={14} /> : "Erstellen"}
        </Button>
      </ActionsRow>
    </Modal>
  );
}
