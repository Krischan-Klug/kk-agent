import FormModal from "@/components/FormModal";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import KeyValueEditor from "@/components/KeyValueEditor";
import { TabBar, TabButton } from "@/components/Tabs";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";
import type { CreateMcpBody } from "@/types/api";

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
    <FormModal
      title="MCP Server hinzufügen"
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
    </FormModal>
  );
}
