import { useState } from "react";
import styled from "styled-components";
import type { McpListItem, UpdateMcpBody } from "kk-agent-contract";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ActionsRow, Section } from "@/components/PageForm";
import { StatusDot } from "@/components/agent/AgentEditor.styled";
import { InstructionEditorBlock, McpEditFields } from "./McpCard.parts";
import { formatMcpServerJson, parseMcpServerJson } from "./configJson";
import { reportError } from "@/lib/errorReporting";
import CredentialEditor from "@/components/CredentialEditor";
import { extractImportedCredentials } from "./credentialImport";

const Header = styled.div<{ $withBody: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: ${(p) => (p.$withBody ? "var(--space-md)" : "0")};
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: nowrap;
`;

const Name = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: nowrap;
  flex-shrink: 0;
`;

const StatusToggle = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
`;

const HeaderNameInput = styled(Input)`
  min-width: 0;
  flex: 1;
  font-weight: 600;
`;

const HeaderEmojiInput = styled(Input)`
  width: 56px;
  min-width: 56px;
  text-align: center;
  font-size: 1.2em;
  flex-shrink: 0;
`;

const NameText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
`;

const RuntimeNotice = styled.div`
  color: var(--danger);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
`;

type Props = {
  mcp: McpListItem;
  systemVariables?: string[];
  onStateToggle: () => Promise<void>;
  onDelete?: () => void;
  onSave: (body: UpdateMcpBody) => Promise<void>;
};

const DEFAULT_MCP_EMOJI = "🧩";

export default function McpCard({
  mcp,
  systemVariables = [],
  onStateToggle,
  onDelete,
  onSave,
}: Props) {
  const [draft, setDraft] = useState({
    name: mcp.name,
    emoji: mcp.emoji ?? "",
    serverJson: formatMcpServerJson(mcp),
    instruction: mcp.instruction,
  });
  const [editOpen, setEditOpen] = useState(false);
  const isActive = mcp.runtime.status === "running";
  const statusTitle = mcp.runtime.status === "unavailable"
    ? `Unavailable${mcp.runtime.error ? `: ${mcp.runtime.error}` : ""}`
    : isActive ? "Active" : "Inactive";
  const parsedServer = parseMcpServerJson(draft.serverJson, mcp.transport);

  function toggleEdit() {
    if (!editOpen) {
      setDraft({
        name: mcp.name,
        emoji: mcp.emoji ?? "",
        serverJson: formatMcpServerJson(mcp),
        instruction: mcp.instruction,
      });
    }
    setEditOpen((open) => !open);
  }

  async function save() {
    if (!parsedServer.ok) return;
    const extracted = extractImportedCredentials({
      name: draft.name,
      transport: mcp.transport,
      emoji: draft.emoji || undefined,
      instruction: draft.instruction,
      credentialBindings: mcp.credentialBindings,
      ...parsedServer.value,
    });
    try {
      const credentials = window.kkAgentDesktop?.credentials;
      if (extracted.pending.length > 0 && !credentials) throw new Error("Secure desktop credential storage is unavailable.");
      if (extracted.pending.length > 0) {
        await credentials!.setMany(Object.fromEntries(extracted.pending.map((entry) => [entry.credentialId, entry.value])));
      }
      await onSave({
        name: draft.name,
        emoji: draft.emoji || undefined,
        instruction: draft.instruction,
        command: extracted.body.command,
        args: extracted.body.args,
        env: mcp.transport === "stdio" ? extracted.body.env ?? {} : undefined,
        url: extracted.body.url,
        headers: mcp.transport !== "stdio" ? extracted.body.headers ?? {} : undefined,
        credentialBindings: extracted.body.credentialBindings,
      });
      setDraft((current) => ({
        ...current,
        serverJson: JSON.stringify(
          mcp.transport === "stdio"
            ? { command: extracted.body.command, args: extracted.body.args ?? [] }
            : { url: extracted.body.url },
          null,
          2,
        ),
      }));
      setEditOpen(false);
    } catch (error) {
      const credentials = window.kkAgentDesktop?.credentials;
      if (credentials) {
        await credentials.removeMany(extracted.pending.map((pending) => pending.credentialId)).catch(() => undefined);
      }
      reportError("Failed to save MCP edit", error);
    }
  }

  return (
    <Card>
      <Header $withBody={editOpen}>
        <HeaderTop>
          <Name>
            {editOpen ? (
              <>
                <HeaderEmojiInput
                  value={draft.emoji}
                  onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                  placeholder={DEFAULT_MCP_EMOJI}
                />
                <HeaderNameInput
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </>
            ) : (
              <>
                <span style={{ fontSize: "1.2em", lineHeight: 1, display: "inline-flex" }}>
                  {mcp.emoji || DEFAULT_MCP_EMOJI}
                </span>
                <NameText title={mcp.name}>{mcp.name}</NameText>
              </>
            )}
            <StatusToggle
              type="button"
              onClick={() => void onStateToggle().catch((error) => reportError("Failed to toggle MCP state", error))}
              aria-label={mcp.active ? "Disable" : "Enable"}
              title={statusTitle}
            >
              <StatusDot $running={isActive} />
            </StatusToggle>
          </Name>
          <Controls>
            <Button size="sm" variant="secondary" onClick={toggleEdit}>
              {editOpen ? "Close" : "Edit"}
            </Button>
          </Controls>
        </HeaderTop>
        {mcp.runtime.status === "unavailable" && (
          <RuntimeNotice>{mcp.runtime.error || "Unavailable"}</RuntimeNotice>
        )}
      </Header>

      {editOpen && (
        <Section>
          <McpEditFields
            mcp={mcp}
            serverJson={draft.serverJson}
            onChange={(serverJson) => setDraft({ ...draft, serverJson })}
          />

          <ActionsRow>
            <Button size="sm" onClick={() => void save()} disabled={!draft.name.trim() || !parsedServer.ok}>
              Save
            </Button>
            {onDelete && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={toggleEdit}>
              Cancel
            </Button>
          </ActionsRow>

          {mcp.credentials.length > 0 && (
            <CredentialEditor
              fields={mcp.credentials.map((credential) => {
                const binding = mcp.credentialBindings?.find((candidate) => candidate.id === credential.id);
                return {
                  ...credential,
                  credentialId: binding?.credentialId ?? "",
                  description: binding
                    ? `${binding.target.kind === "env" ? "Environment" : "HTTP header"}: ${binding.target.name}`
                    : undefined,
                };
              }).filter((credential) => credential.credentialId.length > 0)}
              onChanged={() => onSave({})}
            />
          )}

          <InstructionEditorBlock
            instruction={draft.instruction}
            systemVariables={systemVariables}
            title="Instruction"
            onInstructionChange={(instruction) => setDraft({ ...draft, instruction })}
          />
        </Section>
      )}
    </Card>
  );
}
