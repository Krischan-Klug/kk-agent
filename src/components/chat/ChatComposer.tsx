import styled from "styled-components";
import type { AgentDefinition } from "@/types/api";
import AgentSelect from "@/components/AgentSelect";
import SelectMenu, { type SelectMenuOption } from "@/components/SelectMenu";
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

const Composer = styled.div`
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  overflow: visible;
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

const ControlGroup = styled.label`
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

const ChatInput = styled.input`
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: var(--text-primary);
  border: none;
  font-size: var(--font-size-base);
  font-family: inherit;
  outline: none;
  height: 24px;

  &::placeholder {
    color: var(--text-muted);
  }
`;

const SendIconButton = styled.button`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bg-base);
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
  resolvedEffort: string;
  resolvedTemp: number;
  reasoningOptions: SelectMenuOption[];
  temperatureOptions: SelectMenuOption[];
  maxCtx: number;
  tokenStats: TokenDisplayStats | null;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onReasoningSelect: (value: string) => void;
  onTemperatureSelect: (value: string) => void;
  onAgentSwitch: (agentId: string) => void;
  onSend: () => void;
};

export default function ChatComposer({
  input,
  sending,
  agents,
  currentAgentId,
  resolvedEffort,
  resolvedTemp,
  reasoningOptions,
  temperatureOptions,
  maxCtx,
  tokenStats,
  onInputChange,
  onKeyDown,
  onReasoningSelect,
  onTemperatureSelect,
  onAgentSwitch,
  onSend,
}: Props) {
  return (
    <InputArea>
      <Composer>
        <ComposerInputWrap>
          <ChatInput
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nachricht eingeben..."
            disabled={sending}
          />
        </ComposerInputWrap>
        <ComposerFooter>
          <ComposerMeta>
            <ControlGroup>
              <ControlEmoji>🧠</ControlEmoji>
              <SelectMenu
                value={resolvedEffort}
                options={reasoningOptions}
                onSelect={onReasoningSelect}
                variant="neutral"
              />
            </ControlGroup>
            <ControlGroup>
              <ControlEmoji>🔥</ControlEmoji>
              <SelectMenu
                value={resolvedTemp.toFixed(1)}
                options={temperatureOptions}
                onSelect={onTemperatureSelect}
                variant="neutral"
              />
            </ControlGroup>
            {maxCtx > 0 && tokenStats && (
              <ContextIndicator
                title={`Input: ${tokenStats.input.toLocaleString()} | Output: ${tokenStats.output.toLocaleString()} | Reasoning: ${tokenStats.reasoning.toLocaleString()}`}
              >
                <ContextRing used={tokenStats.input} max={maxCtx} />
                <span>{formatTokens(tokenStats.input)} / {formatTokens(maxCtx)}</span>
              </ContextIndicator>
            )}
          </ComposerMeta>
          <ComposerActions>
            {agents.length > 0 && (
              <AgentSelect agents={agents} currentAgentId={currentAgentId} onSelect={onAgentSwitch} direction="up" />
            )}
            <SendIconButton onClick={onSend} disabled={sending || !input.trim()} aria-label="Nachricht senden">
              ^
            </SendIconButton>
          </ComposerActions>
        </ComposerFooter>
      </Composer>
    </InputArea>
  );
}
