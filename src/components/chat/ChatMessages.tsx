import { useState } from "react";
import styled from "styled-components";
import type { RefObject } from "react";
import type { AgentLoopState, McpListItem, SessionMessage, SessionState } from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { ActiveToolCall, PendingPrompt } from "./types";

/* ── Iteration grouping types & utility ── */

interface AgentIteration {
  assistant: SessionMessage;
  toolResults: Map<string, { content: string; isError: boolean }>;
}

type MessageGroup =
  | { kind: "single"; message: SessionMessage; index: number }
  | { kind: "agent-turn"; iterations: AgentIteration[]; indices: number[] };

function groupMessages(messages: SessionMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role !== "assistant") {
      if (msg.role !== "tool") {
        groups.push({ kind: "single", message: msg, index: i });
      }
      i++;
      continue;
    }

    // Start accumulating an agent turn
    const iterations: AgentIteration[] = [];
    const indices: number[] = [];

    while (i < messages.length && (messages[i].role === "assistant" || messages[i].role === "tool")) {
      const current = messages[i];

      if (current.role === "assistant") {
        const toolResults = new Map<string, { content: string; isError: boolean }>();
        indices.push(i);
        i++;

        // Collect subsequent tool messages belonging to this assistant's tool_calls
        while (i < messages.length && messages[i].role === "tool") {
          const toolMsg = messages[i];
          if (toolMsg.tool_call_id) {
            toolResults.set(toolMsg.tool_call_id, { content: toolMsg.content, isError: false });
          }
          i++;
        }

        iterations.push({ assistant: current, toolResults });
      } else {
        // orphan tool message (shouldn't happen normally)
        i++;
      }
    }

    // Single assistant message without tool_calls -> render as simple single message
    if (iterations.length === 1 && (!iterations[0].assistant.tool_calls || iterations[0].assistant.tool_calls.length === 0)) {
      groups.push({ kind: "single", message: iterations[0].assistant, index: indices[0] });
    } else {
      groups.push({ kind: "agent-turn", iterations, indices });
    }
  }

  return groups;
}

const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: 0 0 var(--space-md);
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const SystemNotice = styled.div`
  align-self: center;
  max-width: 720px;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
`;

const MessageBubble = styled.div<{ $role: string }>`
  max-width: 80%;
  padding: var(--space-md);
  border-radius: var(--radius-md);
  align-self: ${(p) => (p.$role === "user" ? "flex-end" : "flex-start")};
  background: ${(p) =>
    p.$role === "user"
      ? "var(--accent-muted)"
      : p.$role === "tool"
        ? "var(--bg-elevated)"
        : "var(--bg-surface)"};
  border: 1px solid ${(p) => (p.$role === "user" ? "var(--accent)" : "var(--border)")};
  ${(p) => p.$role === "user" && "white-space: pre-wrap;"}
  word-break: break-word;
  font-size: var(--font-size-base);
`;

const RoleLabel = styled.div`
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
`;

const RoleMetaGroup = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font: inherit;
`;

const CollapsibleCard = styled.details`
  margin-top: var(--space-sm);
  border-radius: var(--radius-sm);
  overflow: hidden;

  &[open] > summary {
    border-bottom: 1px solid var(--border);
  }
`;

const ReasoningCard = styled.details`
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--warning) 30%, var(--border));
  font-size: 0.85em;
  margin-bottom: var(--space-sm);
  display: flex;
  flex-direction: column-reverse;

  &[open] > summary {
    border-top: 1px solid color-mix(in srgb, var(--warning) 30%, var(--border));
  }
`;

const ToolCard = styled(CollapsibleCard)`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
`;

const CardSummary = styled.summary`
  cursor: pointer;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  user-select: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::before {
    content: "▶";
    font-size: 10px;
    transition: transform 0.15s;
  }

  details[open] > &::before {
    transform: rotate(90deg);
  }
`;

const ReasoningSummary = styled.summary`
  cursor: pointer;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  user-select: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::before {
    content: "▲";
    font-size: 10px;
    transition: transform 0.15s;
  }

  details:not([open]) > &::before {
    content: "▼";
  }
`;

const CardContent = styled.div`
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  max-height: 300px;
  overflow-y: auto;
`;

const ToolEmoji = styled.span`
  font-size: 1em;
`;

const ToolLabel = styled.span`
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-weight: 500;
`;

const ToolBlockLabel = styled.div`
  color: var(--text-muted);
  margin-bottom: var(--space-xs);
`;

const ToolResultBlock = styled.div<{ $isError: boolean }>`
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
  color: ${(p) => (p.$isError ? "var(--danger)" : "var(--text-secondary)")};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: var(--space-md);
  color: var(--text-secondary);
`;

const StreamingDot = styled.span`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1s infinite;
  margin-left: var(--space-xs);
  vertical-align: middle;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;

const PromptCard = styled.div`
  align-self: center;
  max-width: 720px;
  width: 100%;
  padding: var(--space-md);
  border: 2px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const PromptQuestion = styled.div`
  font-size: var(--font-size-base);
  font-weight: 500;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
`;

const ChoiceButton = styled.button`
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-base);
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const CustomInputRow = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px dashed var(--border);
`;

const CustomInput = styled.input`
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-base);
  outline: none;

  &:focus {
    border-color: var(--border-focus, var(--accent));
  }

  &::placeholder {
    color: var(--text-muted);
  }
`;

const IterationPill = styled.span`
  padding: 1px var(--space-sm);
  background: var(--accent-muted);
  color: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);
  flex-shrink: 0;
`;

const PhasePill = styled.span`
  padding: 1px var(--space-sm);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);
  flex-shrink: 0;
`;

const LoadingWrap = styled.div`
  align-self: flex-start;
`;

const IterationSection = styled.div`
  padding-left: var(--space-md);
  border-left: 2px solid var(--border);
  margin-bottom: var(--space-sm);

  &:last-child {
    margin-bottom: var(--space-sm);
  }
`;

const IterationHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const ExpandArrow = styled.span<{ $expanded: boolean }>`
  margin-left: auto;
  font-size: 10px;
  transition: transform 0.15s;
  transform: rotate(${(p) => (p.$expanded ? "90deg" : "0deg")});
`;

type Props = {
  session: SessionState;
  currentAgentName: string;
  mcps: McpListItem[];
  streaming: boolean;
  streamContent: string;
  streamReasoning: string;
  streamToolCalls: ActiveToolCall[];
  streamRetryNotices: string[];
  loopState: AgentLoopState | null;
  pendingPrompt: PendingPrompt | null;
  customAnswer: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  onCustomAnswerChange: (value: string) => void;
  onPromptResponse: (selectedKey: string) => void;
};

export default function ChatMessages({
  session,
  currentAgentName,
  mcps,
  streaming,
  streamContent,
  streamReasoning,
  streamToolCalls,
  streamRetryNotices,
  loopState,
  pendingPrompt,
  customAnswer,
  messagesRef,
  onMessagesScroll,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  function toggleTurn(key: number) {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getToolEmoji(toolName: string): string {
    for (const mcp of mcps) {
      if (mcp.tools.some((tool) => tool.name === toolName)) return mcp.emoji || "🛠️";
    }
    return "🛠️";
  }

  function submitCustomAnswer() {
    const answer = customAnswer.trim();
    if (!answer) return;
    onPromptResponse(answer);
    onCustomAnswerChange("");
  }

  function renderToolCalls(toolCalls: ActiveToolCall[]) {
    return toolCalls.map((toolCall) => (
      <ToolCard key={toolCall.id}>
        <CardSummary>
          <ToolEmoji>{getToolEmoji(toolCall.name)}</ToolEmoji>
          <ToolLabel>{toolCall.name}</ToolLabel>
          {toolCall.result ? (
            <Badge variant={toolCall.result.isError ? "danger" : "success"}>
              {toolCall.result.isError ? "Fehler" : "Fertig"}
            </Badge>
          ) : (
            <Spinner size={12} />
          )}
        </CardSummary>
        <CardContent>
          <ToolBlockLabel>Arguments:</ToolBlockLabel>
          {JSON.stringify(toolCall.arguments, null, 2)}
          {toolCall.result && (
            <ToolResultBlock $isError={toolCall.result.isError}>
              <ToolBlockLabel>Result:</ToolBlockLabel>
              {toolCall.result.content}
            </ToolResultBlock>
          )}
        </CardContent>
      </ToolCard>
    ));
  }

  function renderMessage(message: SessionMessage, idx: number) {
    if (message.role === "tool") return null;

    return (
      <MessageBubble key={idx} $role={message.role}>
        {message.role !== "user" && (
          <RoleLabel>
            <Badge variant={message.role === "system" ? "warning" : "info"}>
              {message.role === "system" ? "system" : currentAgentName}
            </Badge>
          </RoleLabel>
        )}

        {message.reasoning?.trim() && (
          <ReasoningCard>
            <ReasoningSummary>Reasoning</ReasoningSummary>
            <CardContent>{message.reasoning.trim()}</CardContent>
          </ReasoningCard>
        )}

        {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content}
      </MessageBubble>
    );
  }

  function renderAgentTurn(turn: MessageGroup & { kind: "agent-turn" }, turnKey: number) {
    const { iterations } = turn;
    const finalIteration = iterations[iterations.length - 1];
    const totalToolCalls = iterations.reduce(
      (sum, it) => sum + (it.assistant.tool_calls?.length ?? 0), 0,
    );
    const isExpanded = expandedTurns.has(turnKey);
    const hasMultiple = iterations.length > 1 || totalToolCalls > 0;

    return (
      <MessageBubble key={turnKey} $role="assistant">
        <RoleLabel>
          <Badge variant="info">{currentAgentName}</Badge>
          {hasMultiple && (
            <RoleMetaGroup
              type="button"
              onClick={() => toggleTurn(turnKey)}
              aria-label={isExpanded ? "Details ausblenden" : "Details einblenden"}
              title={isExpanded ? "Details ausblenden" : "Details einblenden"}
            >
              <IterationPill>
                {iterations.length} Iteration{iterations.length > 1 ? "en" : ""}
              </IterationPill>
              {totalToolCalls > 0 && (
                <PhasePill>
                  {totalToolCalls} Tool Call{totalToolCalls > 1 ? "s" : ""}
                </PhasePill>
              )}
              <ExpandArrow $expanded={isExpanded}>&#9654;</ExpandArrow>
            </RoleMetaGroup>
          )}
        </RoleLabel>

        {isExpanded && iterations.map((iteration, i) => {
          const tc = iteration.assistant.tool_calls ?? [];
          const activeToolCalls: ActiveToolCall[] = tc.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            result: iteration.toolResults.get(toolCall.id),
          }));

          return (
            <IterationSection key={i}>
              <IterationHeader>
                <IterationPill>#{i + 1}</IterationPill>
                {tc.length > 0 && (
                  <PhasePill>{tc.length} Tool{tc.length > 1 ? "s" : ""}</PhasePill>
                )}
              </IterationHeader>
              {iteration.assistant.reasoning?.trim() && (
                <ReasoningCard>
                  <ReasoningSummary>Reasoning</ReasoningSummary>
                  <CardContent>{iteration.assistant.reasoning.trim()}</CardContent>
                </ReasoningCard>
              )}
              {iteration.assistant.content?.trim() && (
                <MarkdownMessage content={iteration.assistant.content} />
              )}
              {activeToolCalls.length > 0 && renderToolCalls(activeToolCalls)}
            </IterationSection>
          );
        })}

        {!isExpanded && finalIteration.assistant.reasoning?.trim() && (
          <ReasoningCard>
            <ReasoningSummary>Reasoning</ReasoningSummary>
            <CardContent>{finalIteration.assistant.reasoning.trim()}</CardContent>
          </ReasoningCard>
        )}

        {finalIteration.assistant.content?.trim() && (
          <MarkdownMessage content={finalIteration.assistant.content} />
        )}
      </MessageBubble>
    );
  }

  return (
    <Messages ref={messagesRef} onScroll={onMessagesScroll}>
      {session.messages.length === 0 && !streaming && (
        <EmptyState>
          <p>Schreibe eine Nachricht um zu starten.</p>
        </EmptyState>
      )}

      {groupMessages(session.messages).map((group) => {
        if (group.kind === "single") return renderMessage(group.message, group.index);
        return renderAgentTurn(group, group.indices[0]);
      })}

      {streamRetryNotices.map((message, idx) => (
        <SystemNotice key={`stream-retry-${idx}`}>{message}</SystemNotice>
      ))}

      {streaming && (streamContent || streamReasoning || streamToolCalls.length > 0) && (
        <MessageBubble $role="assistant">
          <RoleLabel>
            <Badge variant="info">{currentAgentName}</Badge>
            <StreamingDot />
            {loopState && <IterationPill>Iteration {loopState.iteration}/{loopState.maxIterations}</IterationPill>}
            {loopState && <PhasePill>{loopState.phase}</PhasePill>}
          </RoleLabel>

          {streamReasoning && (
            <ReasoningCard open>
              <ReasoningSummary>Reasoning</ReasoningSummary>
              <CardContent>{streamReasoning}</CardContent>
            </ReasoningCard>
          )}

          <MarkdownMessage content={streamContent} />
          {streamToolCalls.length > 0 && renderToolCalls(streamToolCalls)}
        </MessageBubble>
      )}

      {streaming && !streamContent && !streamReasoning && streamToolCalls.length === 0 && !pendingPrompt && (
        <LoadingWrap>
          <Spinner />
        </LoadingWrap>
      )}

      {pendingPrompt && (
        <PromptCard>
          <PromptQuestion>{pendingPrompt.question}</PromptQuestion>
          {pendingPrompt.choices.map((choice) => (
            <ChoiceButton key={choice.key} onClick={() => onPromptResponse(choice.key)}>
              {choice.label}
            </ChoiceButton>
          ))}
          <CustomInputRow>
            <CustomInput
              value={customAnswer}
              onChange={(e) => onCustomAnswerChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCustomAnswer();
              }}
              placeholder="Oder eigene Antwort eingeben..."
            />
            <Button onClick={submitCustomAnswer} disabled={!customAnswer.trim()}>
              OK
            </Button>
          </CustomInputRow>
        </PromptCard>
      )}
    </Messages>
  );
}
