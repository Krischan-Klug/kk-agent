import { useRef, useState, useCallback, useLayoutEffect } from "react";
import styled from "styled-components";
import type {
  AgentDefinition,
  AgentLoopState,
  TaskItem,
} from "@/types/api";
import type { PendingAttachment } from "@/hooks/useAttachments";
import SelectMenu from "@/components/SelectMenu";
import Spinner from "@/components/Spinner";
import AttachmentPreview from "./AttachmentPreview";
import type { TokenDisplayStats } from "./types";

const InputArea = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: var(--space-md);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  width: 100%;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Composer = styled.div<{ $dragOver?: boolean }>`
  position: relative;
  z-index: 1;
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid ${(p) => (p.$dragOver ? "var(--accent)" : "var(--border)")};
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  overflow: visible;
  transition: border-color 0.15s;
`;

const ComposerLayout = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 900px);
  justify-content: center;
  align-items: end;
  gap: 6px;
  padding: 0 var(--space-md);
`;

const ComposerStack = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: flex-end;
`;

const TasksDrawer = styled.div<{ $open: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 18px);
  z-index: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 30px;
  background: color-mix(in srgb, var(--bg-elevated) 88%, white 12%);
  border: 1px solid var(--border);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
  transform: translateY(${(p) => (p.$open ? "0" : "18px")});
  opacity: ${(p) => (p.$open ? 1 : 0)};
  pointer-events: ${(p) => (p.$open ? "auto" : "none")};
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
`;

const TasksHeader = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const TasksTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

const TasksToggleButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  background: ${(p) =>
    p.$active ? "var(--accent-muted)" : "var(--bg-elevated)"};
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
`;

const TasksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TaskRow = styled.div<{ $status: TaskItem["status"] }>`
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 4px 0;
  color: ${({ $status }) =>
    $status === "completed" ? "var(--text-muted)" : "var(--text-primary)"};
`;

const TaskStatusDot = styled.span<{ $status: TaskItem["status"] }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status }) =>
    $status === "in_progress"
      ? "var(--success)"
      : $status === "pending"
        ? "var(--warning)"
        : "var(--text-muted)"};
  margin-top: 6px;
`;

const TaskText = styled.span<{ $status: TaskItem["status"] }>`
  display: block;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: ${(p) =>
    p.$status === "completed" ? "line-through" : "none"};
`;

const TaskNotes = styled.span`
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
`;

const TasksButtonEmoji = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const TasksButtonCount = styled.span`
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
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
  flex-wrap: wrap;
`;

const ControlGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/xml",
  "text/html",
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".sh",
  ".sql",
  ".toml",
  ".ini",
  ".log",
  ".pdf",
].join(",");

function ContextRing({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const r = 8;
  const circ = 2 * Math.PI * r;
  const color =
    pct > 0.95
      ? "var(--danger)"
      : pct > 0.8
        ? "var(--warning)"
        : "var(--accent)";
  return (
    <svg width="20" height="20" style={{ flexShrink: 0 }}>
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
      />
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
  activeModeId: string;
  maxCtx: number;
  tokenStats: TokenDisplayStats | null;
  tasks: TaskItem[];
  loopState: AgentLoopState | null;
  pendingAttachments: PendingAttachment[];
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAgentSwitch: (agentId: string) => void;
  onModeSwitch: (modeId: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onFilesSelected: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
};

export default function ChatComposer({
  input,
  sending,
  agents,
  currentAgentId,
  activeModeId,
  maxCtx,
  tokenStats,
  tasks,
  pendingAttachments,
  onInputChange,
  onKeyDown,
  onAgentSwitch,
  onModeSwitch,
  onSend,
  onAbort,
  onFilesSelected,
  onRemoveAttachment,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const currentAgent = agents.find((agent) => agent.id === currentAgentId);
  const modeOptions = (currentAgent?.modes ?? [])
    .filter((mode) => mode.enabled)
    .map((mode) => ({
      value: mode.id,
      label: mode.label,
    }));

  const canSend =
    !sending && (input.trim().length > 0 || pendingAttachments.length > 0);

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
      <ComposerLayout>
        <ComposerStack>
          {tasks.length > 0 && (
            <TasksDrawer $open={tasksOpen}>
              <TasksHeader>
                <TasksTitle>Tasks</TasksTitle>
              </TasksHeader>
              {tasks.length > 0 && (
                <TasksList>
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      $status={task.status}
                      title={
                        task.notes
                          ? `${task.title} - ${task.notes}`
                          : task.title
                      }
                    >
                      <TaskStatusDot $status={task.status} />
                      <div>
                        <TaskText $status={task.status}>{task.title}</TaskText>
                        {task.notes && <TaskNotes>{task.notes}</TaskNotes>}
                      </div>
                    </TaskRow>
                  ))}
                </TasksList>
              )}
            </TasksDrawer>
          )}
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
            <AttachmentPreview
              attachments={pendingAttachments}
              onRemove={onRemoveAttachment}
            />
            <ComposerFooter>
              <ComposerMeta>
                <ControlGroup>
                  <SelectMenu
                    value={activeModeId}
                    options={modeOptions}
                    onSelect={onModeSwitch}
                    direction="up"
                    variant="neutral"
                  />
                </ControlGroup>
                {agents.length > 0 && (
                  <SelectMenu
                    value={currentAgentId}
                    direction="up"
                    minWidth="220px"
                    options={agents.map((agent) => ({
                      value: agent.id,
                      label: agent.name,
                      description: agent.description || undefined,
                    }))}
                    onSelect={onAgentSwitch}
                  />
                )}
              </ComposerMeta>
              <ComposerActions>
                {tasks.length > 0 && (
                  <TasksToggleButton
                    type="button"
                    $active={tasksOpen}
                    onClick={() => setTasksOpen((previous) => !previous)}
                    title={`Tasks (${tasks.length})`}
                    aria-label={`Tasks (${tasks.length})`}
                  >
                    <TasksButtonEmoji>📝</TasksButtonEmoji>
                    {sending ? (
                      <Spinner size={12} />
                    ) : (
                      <TasksButtonCount>{tasks.length}</TasksButtonCount>
                    )}
                  </TasksToggleButton>
                )}
                {maxCtx > 0 && tokenStats && (
                  <ContextIndicator
                    title={`Input: ${tokenStats.input.toLocaleString()} | Output: ${tokenStats.output.toLocaleString()} | Reasoning: ${tokenStats.reasoning.toLocaleString()}`}
                  >
                    <ContextRing used={tokenStats.input} max={maxCtx} />
                    <span>
                      {formatTokens(tokenStats.input)} / {formatTokens(maxCtx)}
                    </span>
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
                {sending && onAbort ? (
                  <SendIconButton
                    onClick={onAbort}
                    aria-label="Abbrechen"
                    title="Abbrechen"
                  >
                    x
                  </SendIconButton>
                ) : (
                  <SendIconButton
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label="Nachricht senden"
                  >
                    ^
                  </SendIconButton>
                )}
              </ComposerActions>
            </ComposerFooter>
          </Composer>
        </ComposerStack>
      </ComposerLayout>
    </InputArea>
  );
}
