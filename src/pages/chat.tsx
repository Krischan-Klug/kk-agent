import { useEffect, useState, useRef, useCallback } from "react";
import styled from "styled-components";
import { session as sessionApi, provider as providerApi, mcp as mcpApi, agent as agentApi } from "@/lib/api";
import type { SessionState, SessionMessage, StreamEvent, McpListItem, AgentDefinition, AgentLoopState, ModelInfo, ModelSettings } from "@/types/api";
import { REASONING_LEVELS } from "@/constants/reasoningDefaults";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import ModelSelect from "@/components/ModelSelect";
import McpSelect from "@/components/McpSelect";
import AgentSelect from "@/components/AgentSelect";

/* ── Styled Components ── */

const ChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: calc(100vh - 2 * var(--space-lg));
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-md);
  flex-shrink: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto var(--space-md);
`;

const TopBarInfo = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
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
  border: 1px solid
    ${(p) => (p.$role === "user" ? "var(--accent)" : "var(--border)")};
  ${(p) => p.$role === "user" && "white-space: pre-wrap;"}
  word-break: break-word;
  font-size: var(--font-size-base);
  ${(p) =>
    p.$role === "tool" &&
    `
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  `}
`;

const RoleLabel = styled.div`
  margin-bottom: var(--space-xs);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
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

const ToolLabel = styled.span`
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-weight: 500;
`;

const ToolResultBlock = styled.div<{ $isError: boolean }>`
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
  color: ${(p) => (p.$isError ? "var(--danger)" : "var(--text-secondary)")};
`;

const InputArea = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
`;

const InputLeft = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
`;

const ReasoningSelect = styled.select`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  padding: 2px 4px;
  cursor: pointer;
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
  min-width: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 42px;
  max-height: 120px;

  &:focus {
    border-color: var(--border-focus);
  }

  &::placeholder {
    color: var(--text-muted);
  }
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

/* ── Types for streaming state ── */

interface ActiveToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: { content: string; isError: boolean };
}

interface TokenDisplayStats {
  input: number;
  output: number;
  reasoning: number;
}

interface PendingPrompt {
  promptId: string;
  question: string;
  choices: { key: string; label: string }[];
}

/* ── Context Ring ── */

function ContextRing({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const r = 8;
  const circ = 2 * Math.PI * r;
  const color = pct > 0.95 ? "var(--danger)" : pct > 0.8 ? "var(--warning)" : "var(--accent)";
  return (
    <svg width="20" height="20" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle
        cx="10" cy="10" r={r} fill="none" stroke={color} strokeWidth="2"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
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

/* ── Content Parser ── */


/* ── Component ── */

export default function ChatPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const [models, setModels] = useState<string[]>([]);
  const [modelInfoMap, setModelInfoMap] = useState<Map<string, ModelInfo>>(new Map());
  const [modelSettingsMap, setModelSettingsMap] = useState<Record<string, ModelSettings>>({});
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<ActiveToolCall[]>([]);
  const [streamRetryNotices, setStreamRetryNotices] = useState<string[]>([]);
  const [loopState, setLoopState] = useState<AgentLoopState | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenDisplayStats | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");

  const messagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, []);

  const loadSession = useCallback(() => {
    const id = localStorage.getItem("activeSessionId");
    if (id) {
      sessionApi
        .get(id)
        .then(setSession)
        .catch(() => {
          localStorage.removeItem("activeSessionId");
          setSession(null);
        })
        .finally(() => setLoading(false));
    } else {
      setSession(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    providerApi.getModels().then((res) => {
      setModels(res.models.map((m) => m.id));
      setModelInfoMap(new Map(res.models.map((m) => [m.id, m])));
      setModelSettingsMap(res.modelSettings ?? {});
    }).catch(() => {});
    mcpApi.list().then(setMcps).catch(() => {});
    agentApi.list().then(setAgents).catch(() => {});

    window.addEventListener("session-changed", loadSession);
    return () => window.removeEventListener("session-changed", loadSession);
  }, [loadSession]);

  useEffect(scrollToBottom, [session?.messages, streamContent, streamReasoning, streamToolCalls, scrollToBottom]);

  const reasoningLevels = REASONING_LEVELS;

  // Resolve effective reasoning effort: session override > model default > "medium"
  const resolvedEffort: string = session
    ? (session.reasoningEffort ?? modelSettingsMap[session.model]?.reasoningEffort ?? "medium")
    : "medium";

  // Resolve effective temperature: session override > level config > default (1.0)
  const resolvedTemp: number = session?.temperature ?? 1.0;

  // Context info: prefer actual loaded context length, fall back to model maximum
  const modelInfo = session ? modelInfoMap.get(session.model) : undefined;
  const maxCtx = modelInfo?.contextLength ?? modelInfo?.maxContextLength ?? 0;
  const currentAgentName = session
    ? (agents.find((agent) => agent.id === session.agentId)?.name ?? session.agentId)
    : "assistant";

  async function handleSend() {
    if (!input.trim() || !session || sending) return;
    const message = input.trim();
    setInput("");
    setSending(true);
    setStreaming(true);
    setStreamContent("");
    setStreamReasoning("");
    setStreamToolCalls([]);
    setLoopState(null);
    setTokenStats(null);

    // Optimistic: add user message
    setSession((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, { role: "user" as const, content: message }] }
        : prev,
    );

    try {
      await sessionApi.chatStream(session.id, message, (event: StreamEvent) => {
        switch (event.type) {
          case "content":
            setStreamContent((prev) => prev + event.content);
            break;
          case "reasoning":
            setStreamReasoning((prev) => prev + event.content);
            break;
          case "retry_notice":
            setStreamRetryNotices((prev) => [...prev, event.message]);
            break;
          case "tool_call":
            setStreamToolCalls((prev) => [
              ...prev,
              { id: event.toolCall.id, name: event.toolCall.name, arguments: event.toolCall.arguments },
            ]);
            break;
          case "tool_result":
            setStreamToolCalls((prev) =>
              prev.map((tc) =>
                tc.id === event.toolCallId
                  ? { ...tc, result: { content: event.content, isError: event.isError } }
                  : tc,
              ),
            );
            break;
          case "loop_state":
            setLoopState(event.state);
            break;
          case "stats":
            if (event.source === "provider") {
              setTokenStats({
                input: event.inputTokens,
                output: event.outputTokens,
                reasoning: event.reasoningTokens,
              });
            }
            break;
          case "user_prompt":
            setPendingPrompt({
              promptId: event.promptId,
              question: event.question,
              choices: event.choices,
            });
            break;
          case "done":
            setSession(event.session);
            setStreaming(false);
            setStreamContent("");
            setStreamReasoning("");
            setStreamToolCalls([]);
            setStreamRetryNotices([]);
            setLoopState(null);
            setPendingPrompt(null);
            window.dispatchEvent(new Event("session-changed"));
            break;
          case "error":
            console.error("Stream error:", event.message);
            setStreaming(false);
            setStreamRetryNotices([]);
            setLoopState(null);
            setPendingPrompt(null);
            break;
        }
      });
    } catch (err) {
      console.error(err);
      setStreaming(false);
      setLoopState(null);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleModelSwitch(model: string) {
    if (!session || model === session.model) return;
    try {
      const updated = await sessionApi.update(session.id, { model });
      setSession(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMcpToggle(mcpId: string, enabled: boolean) {
    if (!session) return;
    const newIds = enabled
      ? [...session.activeMcpIds, mcpId]
      : session.activeMcpIds.filter((id) => id !== mcpId);
    try {
      const updated = await sessionApi.update(session.id, { activeMcpIds: newIds });
      setSession(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReasoningEffort(value: string) {
    if (!session) return;
    const reasoningEffort = value || undefined;
    try {
      const updated = await sessionApi.update(session.id, { reasoningEffort });
      setSession(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleTemperature(value: string) {
    if (!session) return;
    try {
      const updated = await sessionApi.update(session.id, { temperature: Number(value) });
      setSession(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAgentSwitch(agentId: string) {
    if (!session || agentId === session.agentId) return;
    try {
      const newSession = await sessionApi.create({
        agentId,
        model: session.model,
        activeMcpIds: session.activeMcpIds,
      });
      localStorage.setItem("activeSessionId", newSession.id);
      setSession(newSession);
      setTokenStats(null);
      window.dispatchEvent(new Event("session-changed"));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleNewSession() {
    const agentId = agents.length > 0 ? agents[0].id : "general-assistant";
    try {
      const newSession = await sessionApi.create({ agentId });
      localStorage.setItem("activeSessionId", newSession.id);
      setSession(newSession);
      setTokenStats(null);
      window.dispatchEvent(new Event("session-changed"));
    } catch (err) {
      console.error(err);
    }
  }

  async function handlePromptResponse(selectedKey: string) {
    if (!session || !pendingPrompt) return;
    try {
      await sessionApi.respondToPrompt(session.id, pendingPrompt.promptId, selectedKey);
      setPendingPrompt(null);
    } catch (err) {
      console.error("Failed to respond to prompt:", err);
    }
  }

  function getToolEmoji(toolName: string): string {
    for (const m of mcps) {
      if (m.tools.some((t) => t.name === toolName)) {
        return m.emoji || "🛠️";
      }
    }
    return "🛠️";
  }

  function renderToolCalls(toolCalls: ActiveToolCall[]) {
    return toolCalls.map((tc) => (
      <ToolCard key={tc.id}>
        <CardSummary>
          <span style={{ fontSize: "1em" }}>{getToolEmoji(tc.name)}</span>
          <ToolLabel>{tc.name}</ToolLabel>
          {tc.result ? (
            <Badge variant={tc.result.isError ? "danger" : "success"}>
              {tc.result.isError ? "Fehler" : "Fertig"}
            </Badge>
          ) : (
            <Spinner size={12} />
          )}
        </CardSummary>
        <CardContent>
          <div style={{ color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>Arguments:</div>
          {JSON.stringify(tc.arguments, null, 2)}
          {tc.result && (
            <ToolResultBlock $isError={tc.result.isError}>
              <div style={{ color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>Result:</div>
              {tc.result.content}
            </ToolResultBlock>
          )}
        </CardContent>
      </ToolCard>
    ));
  }

  function renderMessage(msg: SessionMessage, idx: number) {
    const reasoning = msg.reasoning?.trim() ?? "";
    const content = msg.content;

    if (msg.role === "tool") return null;

    return (
      <MessageBubble key={idx} $role={msg.role}>
        {msg.role !== "user" && (
          <RoleLabel>
            <Badge variant="info">{currentAgentName}</Badge>
          </RoleLabel>
        )}

        {reasoning && (
          <ReasoningCard>
            <ReasoningSummary>Reasoning</ReasoningSummary>
            <CardContent>{reasoning}</CardContent>
          </ReasoningCard>
        )}

        {msg.role === "assistant" ? <MarkdownMessage content={content} /> : content}

        {msg.tool_calls && msg.tool_calls.length > 0 &&
          renderToolCalls(
            msg.tool_calls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              result: (() => {
                const toolMsg = session?.messages.find(
                  (m) => m.role === "tool" && m.tool_call_id === tc.id,
                );
                return toolMsg
                  ? { content: toolMsg.content, isError: false }
                  : undefined;
              })(),
            })),
          )}
      </MessageBubble>
    );
  }

  if (loading) return <Spinner />;

  if (!session) {
    return (
      <ChatWrapper>
        <EmptyState>
          <p>Keine aktive Session.</p>
          <Button onClick={handleNewSession}>Neue Session starten</Button>
        </EmptyState>
      </ChatWrapper>
    );
  }

  return (
    <ChatWrapper>
      <TopBar>
        <TopBarInfo>
          {agents.length > 0 && (
            <AgentSelect agents={agents} currentAgentId={session.agentId} onSelect={handleAgentSwitch} />
          )}
          {models.length > 0 ? (
            <ModelSelect models={models} currentModel={session.model} onSelect={handleModelSwitch} />
          ) : (
            <Badge variant="info">{session.model}</Badge>
          )}
          <McpSelect
            mcps={mcps}
            activeMcpIds={session.activeMcpIds}
            onToggle={handleMcpToggle}
          />
          <span style={{
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-sm)",
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {session.name || session.id.slice(0, 8)}
          </span>
        </TopBarInfo>
        <Button size="sm" variant="secondary" onClick={handleNewSession}>
          Neue Session
        </Button>
      </TopBar>

      <Messages ref={messagesRef}>
        {session.messages.length === 0 && !streaming && (
          <EmptyState>
            <p>Schreibe eine Nachricht um zu starten.</p>
          </EmptyState>
        )}

        {session.messages.map(renderMessage)}

        {streamRetryNotices.map((msg, idx) => (
          <SystemNotice key={`stream-retry-${idx}`}>{msg}</SystemNotice>
        ))}

        {/* Live streaming bubble */}
        {streaming && (streamContent || streamReasoning || streamToolCalls.length > 0) && (
          <MessageBubble $role="assistant">
            <RoleLabel>
              <Badge variant="info">{currentAgentName}</Badge>
              <StreamingDot />
              {loopState && (
                <IterationPill>
                  Iteration {loopState.iteration}/{loopState.maxIterations}
                </IterationPill>
              )}
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
          <div style={{ alignSelf: "flex-start" }}>
            <Spinner />
          </div>
        )}

        {pendingPrompt && (
          <PromptCard>
            <PromptQuestion>{pendingPrompt.question}</PromptQuestion>
            {pendingPrompt.choices.map((choice) => (
              <ChoiceButton key={choice.key} onClick={() => handlePromptResponse(choice.key)}>
                {choice.label}
              </ChoiceButton>
            ))}
            <CustomInputRow>
              <CustomInput
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAnswer.trim()) {
                    handlePromptResponse(`custom:${customAnswer.trim()}`);
                    setCustomAnswer("");
                  }
                }}
                placeholder="Oder eigene Antwort eingeben..."
              />
              <Button
                onClick={() => {
                  if (customAnswer.trim()) {
                    handlePromptResponse(`custom:${customAnswer.trim()}`);
                    setCustomAnswer("");
                  }
                }}
                disabled={!customAnswer.trim()}
              >
                OK
              </Button>
            </CustomInputRow>
          </PromptCard>
        )}
      </Messages>

      <InputArea>
        <InputLeft>
          <span style={{ fontSize: "var(--font-size-sm)" }}>🧠</span>
          <ReasoningSelect
            value={resolvedEffort}
            onChange={(e) => handleReasoningEffort(e.target.value)}
          >
            {reasoningLevels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </ReasoningSelect>
          <span style={{ fontSize: "var(--font-size-sm)" }}>🔥</span>
          <ReasoningSelect
            value={resolvedTemp.toFixed(1)}
            onChange={(e) => handleTemperature(e.target.value)}
          >
            {Array.from({ length: 21 }, (_, i) => {
              const v = (i * 0.1).toFixed(1);
              return <option key={v} value={v}>{v}</option>;
            })}
          </ReasoningSelect>
        </InputLeft>
        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht eingeben..."
          rows={1}
          disabled={sending}
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()}>
          Senden
        </Button>
        {maxCtx > 0 && tokenStats && (
          <ContextIndicator
            title={`Input: ${tokenStats.input.toLocaleString()} | Output: ${tokenStats.output.toLocaleString()} | Reasoning: ${tokenStats.reasoning.toLocaleString()}`}
          >
            <ContextRing used={tokenStats.input} max={maxCtx} />
            <span>{formatTokens(tokenStats.input)} / {formatTokens(maxCtx)}</span>
          </ContextIndicator>
        )}
      </InputArea>
    </ChatWrapper>
  );
}
