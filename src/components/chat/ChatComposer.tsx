import { useRef, useState, useCallback, useLayoutEffect } from "react";
import styled from "styled-components";
import type { AgentDefinition } from "@/types/api";
import type { PendingAttachment } from "@/hooks/useAttachments";
import AgentSelect from "@/components/AgentSelect";
import SelectMenu, { type SelectMenuOption } from "@/components/SelectMenu";
import AttachmentPreview from "./AttachmentPreview";
import type { TokenDisplayStats } from "./types";

const InputArea = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: var(--space-md);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Composer = styled.div<{ $dragOver?: boolean }>`
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid ${(p) => (p.$dragOver ? "var(--accent)" : "var(--border)")};
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  overflow: visible;
  transition: border-color 0.15s;
`;

const ComposerInputWrap = styled.div`
  padding: var(--space-md) var(--space-md) 4px;
`;

const ComposerFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 0 var(--space-sm) var(--space-sm);
  flex-wrap: wrap;
`;

const ComposerMeta = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const ComposerActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
`;

const ControlGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const ControlEmoji = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const ContextIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  flex-shrink: 0;
`;

const ChatInput = styled.textarea`
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-family: inherit;
  outline: none;
  line-height: 24px;
  min-height: 24px;
  max-height: 192px;
  border: none;
  resize: none;
  overflow-y: auto;
  field-sizing: content;

  &::placeholder {
    color: var(--text-muted);
  }
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const SendIconButton = styled(IconButton)`
  background: var(--accent);
  color: var(--bg-base);
`;

const AttachIconButton = styled(IconButton)`
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 18px;
  font-weight: 400;

  &:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    filter: none;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const ACCEPTED_FILES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "application/json",
  "text/plain", "text/markdown", "text/csv", "text/xml", "text/html",
  ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".html", ".css",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h",
  ".sh", ".sql", ".toml", ".ini", ".log", ".pdf",
].join(",");

function ContextRing({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const r = 8;
  const circ = 2 * Math.PI * r;
  const color = pct > 0.95 ? "var(--danger)" : pct > 0.8 ? "var(--warning)" : "var(--accent)";
  return (
    <svg width="20" height="20" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform="rotate(-90 10 10)"
        style={{ transition: "stroke-dashoffset 0.3s" }}
      />
    </svg>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

type Props = {
  input: string;
  sending: boolean;
  agents: AgentDefinition[];
  currentAgentId: string;
  showReasoningControl: boolean;
  showTemperatureControl: boolean;
  resolvedEffort: string;
  resolvedTemp: number;
  reasoningOptions: SelectMenuOption[];
  temperatureOptions: SelectMenuOption[];
  maxCtx: number;
  tokenStats: TokenDisplayStats | null;
  pendingAttachments: PendingAttachment[];
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onReasoningSelect: (value: string) => void;
  onTemperatureSelect: (value: string) => void;
  onAgentSwitch: (agentId: string) => void;
  onSend: () => void;
  onFilesSelected: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
};

export default function ChatComposer({
  input,
  sending,
  agents,
  currentAgentId,
  showReasoningControl,
  showTemperatureControl,
  resolvedEffort,
  resolvedTemp,
  reasoningOptions,
  temperatureOptions,
  maxCtx,
  tokenStats,
  pendingAttachments,
  onInputChange,
  onKeyDown,
  onReasoningSelect,
  onTemperatureSelect,
  onAgentSwitch,
  onSend,
  onFilesSelected,
  onRemoveAttachment,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const canSend = !sending && (input.trim().length > 0 || pendingAttachments.length > 0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(e.dataTransfer.files);
      }
    },
    [onFilesSelected],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        onFilesSelected(dt.files);
      }
    },
    [onFilesSelected],
  );

  useLayoutEffect(() => {
    const element = textAreaRef.current;
    if (!element) return;
    element.style.height = "24px";
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`;
  }, [input]);

  return (
    <InputArea>
      <Composer
        $dragOver={dragOver}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ComposerInputWrap>
          <ChatInput
            ref={textAreaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder="Nachricht eingeben..."
            disabled={sending}
            rows={1}
            aria-label="Chat-Nachricht"
          />
        </ComposerInputWrap>
        <AttachmentPreview attachments={pendingAttachments} onRemove={onRemoveAttachment} />
        <ComposerFooter>
          <ComposerMeta>
            {showReasoningControl && (
              <ControlGroup>
                <ControlEmoji>🧠</ControlEmoji>
                <SelectMenu
                  value={resolvedEffort}
                  options={reasoningOptions}
                  onSelect={onReasoningSelect}
                  direction="up"
                  variant="neutral"
                />
              </ControlGroup>
            )}
            {showTemperatureControl && (
              <ControlGroup>
                <ControlEmoji>🔥</ControlEmoji>
                <SelectMenu
                  value={resolvedTemp.toFixed(1)}
                  options={temperatureOptions}
                  onSelect={onTemperatureSelect}
                  direction="up"
                  variant="neutral"
                />
              </ControlGroup>
            )}
            {agents.length > 0 && (
              <AgentSelect agents={agents} currentAgentId={currentAgentId} onSelect={onAgentSwitch} direction="up" />
            )}
          </ComposerMeta>
          <ComposerActions>
            {maxCtx > 0 && tokenStats && (
              <ContextIndicator
                title={`Input: ${tokenStats.input.toLocaleString()} | Output: ${tokenStats.output.toLocaleString()} | Reasoning: ${tokenStats.reasoning.toLocaleString()}`}
              >
                <ContextRing used={tokenStats.input} max={maxCtx} />
                <span>{formatTokens(tokenStats.input)} / {formatTokens(maxCtx)}</span>
              </ContextIndicator>
            )}
            <HiddenFileInput
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFilesSelected(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <AttachIconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Datei anhaengen"
              title="Datei anhaengen"
            >
              +
            </AttachIconButton>
            <SendIconButton onClick={onSend} disabled={!canSend} aria-label="Nachricht senden">
              ^
            </SendIconButton>
          </ComposerActions>
        </ComposerFooter>
      </Composer>
    </InputArea>
  );
}
