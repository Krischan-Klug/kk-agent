import { useEffect, useMemo, useState } from "react";
import FormModal from "@/components/FormModal";
import type { CreateMcpBody } from "kk-agent-contract";
import McpJsonEditor from "./McpJsonEditor";
import { MCP_IMPORT_HINT, MCP_IMPORT_PLACEHOLDER, parseMcpImportJson } from "./configJson";

type Props = {
  open: boolean;
  creating: boolean;
  onCreate: (form: CreateMcpBody) => void;
  onClose: () => void;
};

export default function CreateMcpModal({ open, creating, onCreate, onClose }: Props) {
  const [configJson, setConfigJson] = useState("");
  const parsed = useMemo(() => parseMcpImportJson(configJson), [configJson]);

  useEffect(() => {
    setConfigJson("");
  }, [open]);

  if (!open) return null;

  return (
    <FormModal
      title="Import MCP Server"
      onClose={onClose}
      onSubmit={() => {
        if (parsed.ok) onCreate(parsed.value);
      }}
      submitLabel="Import"
      submitDisabled={!parsed.ok}
      submitting={creating}
    >
      <McpJsonEditor
        value={configJson}
        onChange={setConfigJson}
        hint={MCP_IMPORT_HINT}
        placeholder={MCP_IMPORT_PLACEHOLDER}
        error={configJson.trim() && !parsed.ok ? parsed.error : undefined}
      />
    </FormModal>
  );
}
