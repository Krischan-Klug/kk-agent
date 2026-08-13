import styled from "styled-components";

const thinkingDots = `
  @keyframes thinkingDotsPulse {
    0%, 24% { content: "."; }
    25%, 49% { content: ".."; }
    50%, 74% { content: "..."; }
    75%, 100% { content: ".."; }
  }
`;

export const Messages = styled.div`
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

export const SystemNotice = styled.div<{ $severity: "info" | "warning" | "error" }>`
  align-self: center;
  max-width: 720px;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid ${(p) => p.$severity === "error" ? "var(--danger)" : p.$severity === "warning" ? "var(--warning)" : "var(--border)"};
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: ${(p) => p.$severity === "error" ? "var(--danger)" : "var(--text-secondary)"};
  font-size: var(--font-size-sm);
  text-align: center;
`;

export const MessageBubble = styled.div<{ $role: string }>`
  max-width: 80%;
  position: relative;
  padding: var(--space-md);
  padding-bottom: calc(var(--space-md) + 18px);
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

export const RoleLabel = styled.div`
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
`;

export const RoleMetaGroup = styled.button`
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

export const ReasoningCard = styled.details`
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

export const ToolCard = styled(CollapsibleCard)`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
`;

export const CardSummary = styled.summary`
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
    content: "\\25B6";
    font-size: 10px;
    transition: transform 0.15s;
  }

  details[open] > &::before {
    transform: rotate(90deg);
  }
`;

export const ReasoningSummary = styled.summary`
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
    content: "\\25B2";
    font-size: 10px;
    transition: transform 0.15s;
  }

  details:not([open]) > &::before {
    content: "\\25BC";
  }
`;

export const CardContent = styled.div`
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  max-height: 300px;
  overflow-y: auto;
`;

export const ToolEmoji = styled.span`
  font-size: 1em;
`;

export const ToolLabel = styled.span`
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
`;

export const ToolDisplayText = styled.span`
  color: var(--text-secondary);
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ToolBlockLabel = styled.div`
  color: var(--text-muted);
  margin-bottom: var(--space-xs);
`;

export const ToolContentSection = styled.div`
  &:not(:first-child) {
    margin-top: var(--space-sm);
  }
`;

export const ToolResultBlock = styled.div<{ $isError: boolean }>`
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
  color: ${(p) => (p.$isError ? "var(--danger)" : "var(--text-secondary)")};
`;

export const ToolDetailSection = styled.div`
  margin-top: var(--space-xs);
`;

export const ToolDetailMuted = styled.div`
  color: var(--text-muted);
  font-size: 0.85em;
`;

export const ToolDetailLine = styled.div`
  font-size: 0.85em;
  margin-top: 2px;
`;

export const ToolDetailPre = styled.pre`
  background: var(--bg-surface);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre;
  font-size: 0.85em;
  margin: var(--space-xs) 0 0;
  max-height: 200px;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: var(--space-md);
  color: var(--text-secondary);
`;

export const StreamingDot = styled.span`
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

export const PromptCard = styled.div`
  align-self: center;
  max-width: 720px;
  width: 100%;
  padding: var(--space-md);
  border: 2px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

export const PromptQuestion = styled.div`
  font-size: var(--font-size-base);
  font-weight: 500;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
`;

export const ChoiceButton = styled.button`
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

export const CustomInputRow = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px dashed var(--border);
`;

export const CustomInput = styled.input`
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

export const StepPill = styled.span`
  padding: 1px var(--space-sm);
  background: var(--accent-muted);
  color: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);
  flex-shrink: 0;
`;

export const PhasePill = styled.span`
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

export const LoadingWrap = styled.div`
  align-self: flex-start;
`;

export const StepSection = styled.div`
  padding-left: var(--space-md);
  border-left: 2px solid var(--border);
  margin-bottom: var(--space-sm);

  &:last-child {
    margin-bottom: var(--space-sm);
  }
`;

export const StepHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

export const ExpandArrow = styled.span<{ $expanded: boolean }>`
  margin-left: auto;
  font-size: 10px;
  transition: transform 0.15s;
  transform: rotate(${(p) => (p.$expanded ? "90deg" : "0deg")});
`;

export const MessageFooter = styled.div`
  position: absolute;
  right: var(--space-md);
  bottom: var(--space-md);
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
`;

export const MessageTimestamp = styled.span`
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
`;

export const ThinkingLabel = styled.span`
  font-weight: 500;
`;

export const ThinkingSuffix = styled.span<{ $active: boolean }>`
  display: inline-block;
  min-width: 1.2em;
  color: var(--text-secondary);
  font-family: var(--font-mono);

  ${thinkingDots}

  &::after {
    content: "...";
    display: inline-block;
    white-space: pre;
    animation: ${(p) => (p.$active ? "thinkingDotsPulse 1.2s infinite steps(1, end)" : "none")};
  }
`;
