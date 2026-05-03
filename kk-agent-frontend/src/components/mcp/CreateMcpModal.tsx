import { useState } from "react";
import Button from "@/components/Button";
import FormModal from "@/components/FormModal";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import { TabBar, TabButton } from "@/components/Tabs";
import { ActionsRow, FieldLabel, FormField, FormRow, MutedText } from "@/components/PageForm";
import type { CreateMcpBody } from "@/types/api";

type Props = {
  open: boolean;
  form: CreateMcpBody;
  creating: boolean;
  systemVariables: string[];
  onChange: (form: CreateMcpBody) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateMcpModal({ open, form, creating, systemVariables, onChange, onCreate, onClose }: Props) {
  const [showSystemVariables, setShowSystemVariables] = useState(false);

  if (!open) return null;

  return (
    <FormModal
      title="Add MCP Server"
      onClose={onClose}
      onSubmit={onCreate}
      submitDisabled={!form.name}
      submitting={creating}
    >
      <FormField>
        <FormRow>
          <FormField $flex={1}>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="e.g. Filesystem"
            />
          </FormField>
          <FormField>
            <FieldLabel>Emoji</FieldLabel>
            <Input
              value={form.emoji ?? ""}
              onChange={(e) => onChange({ ...form, emoji: e.target.value })}
              placeholder="🧩"
              style={{ width: 60, textAlign: "center", fontSize: "1.2em" }}
            />
          </FormField>
        </FormRow>
      </FormField>
      <FormField>
        <FieldLabel>Transport</FieldLabel>
        <TabBar>
          <TabButton $active={form.transport === "stdio"} onClick={() => onChange({ ...form, transport: "stdio" })}>
            stdio
          </TabButton>
          <TabButton $active={form.transport === "sse"} onClick={() => onChange({ ...form, transport: "sse" })}>
            sse
          </TabButton>
        </TabBar>
      </FormField>
      {form.transport === "stdio" ? (
        <>
          <FormField>
            <FieldLabel>Command</FieldLabel>
            <Input
              value={form.command ?? ""}
              onChange={(e) => onChange({ ...form, command: e.target.value })}
              placeholder="e.g. npx"
            />
          </FormField>
          <FormField>
            <FieldLabel>Args (one argument per line)</FieldLabel>
            <TextArea
              value={(form.args ?? []).join("\n")}
              onChange={(e) => onChange({ ...form, args: e.target.value.split("\n").filter(Boolean) })}
              rows={4}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
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
          placeholder="System instruction for this MCP..."
        />
      </FormField>
      <ActionsRow>
        <Button size="sm" variant="secondary" type="button" onClick={() => setShowSystemVariables((prev) => !prev)}>
          {showSystemVariables ? "Hide system variables" : "Show system variables"}
        </Button>
      </ActionsRow>
      {showSystemVariables && <MutedText>{systemVariables.join(", ")}</MutedText>}
    </FormModal>
  );
}
