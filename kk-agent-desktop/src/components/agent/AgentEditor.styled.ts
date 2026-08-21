import styled from "styled-components";
import { FormRow } from "@/components/PageForm";
export { InlineSelect, ModeTab, ModeTabs, Select } from "@/components/FormControls.styled";

export const EditorArea = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
`;

export const AgentActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-left: auto;
  align-self: flex-end;
`;

export const AgentWorkspaceTabs = styled.div`
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border);
`;

export const AgentWorkspaceTab = styled.button<{ $active: boolean }>`
  padding: 7px 12px;
  color: ${({ $active }) => ($active ? "var(--accent-foreground)" : "var(--text-secondary)")};
  background: ${({ $active }) => ($active ? "var(--accent)" : "transparent")};
  border: 1px solid ${({ $active }) => ($active ? "var(--accent)" : "transparent")};
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    color: ${({ $active }) => ($active ? "var(--accent-foreground)" : "var(--text-primary)")};
    background: ${({ $active }) => ($active ? "var(--accent)" : "var(--bg-hover)")};
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const AgentWorkspacePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
`;

export const SkillsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-sm);
`;

export const SkillCapabilityRow = styled.div<{ $active: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-sm);
  align-items: start;
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid ${({ $active }) => ($active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  opacity: ${({ $active }) => ($active ? 1 : 0.72)};

  > button {
    grid-row: span 2;
    margin-top: 1px;
  }

  > p {
    grid-column: 2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
`;

export const ModeColorPicker = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs);
`;

export const ModeColorButton = styled.button<{ $active: boolean; $color: string }>`
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid ${({ $active, $color }) => ($active ? $color : "var(--bg-surface)")};
  border-radius: 50%;
  background: ${({ $color }) => $color};
  box-shadow: 0 0 0 ${({ $active }) => ($active ? "1px var(--text-primary)" : "1px var(--border)")};
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;

  &:hover {
    transform: scale(1.12);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const ModeCustomColorPicker = styled.label`
  width: 22px;
  height: 22px;
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#f87171, #fbbf24, #4ade80, #60a5fa, #a78bfa, #f472b6, #f87171);
  color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--border);
  cursor: pointer;

  &::after {
    content: "+";
    font-size: 16px;
    line-height: 1;
    font-weight: 700;
    text-shadow: 0 1px 2px var(--bg-surface);
    pointer-events: none;
  }

  &:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const ModeColorInput = styled.input`
  width: 22px;
  height: 22px;
  position: absolute;
  inset: 0;
  padding: 0;
  border: none;
  opacity: 0;
  cursor: pointer;
`;

export const CapabilityRow = styled.div<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  opacity: ${(p) => (p.$active ? 1 : 0.6)};
`;

export const PromptSectionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

export const PromptSectionField = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
`;

export const CapabilityHeader = styled(FormRow)`
  justify-content: space-between;
  align-items: center;
`;

export const HeaderActions = styled(FormRow)`
  align-items: center;
  gap: var(--space-xs);
`;

export const ExpandButton = styled.button<{ $expanded?: boolean }>`
  width: 28px;
  height: 28px;
  padding: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(${({ $expanded }) => ($expanded ? "225deg" : "45deg")});
    margin-top: ${({ $expanded }) => ($expanded ? "4px" : "-3px")};
    transition: transform 120ms ease, margin 120ms ease;
  }

  &:hover {
    background: var(--bg-elevated);
    border-color: var(--border);
    color: var(--text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const CapabilityIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
`;

export const CapabilityToggle = styled.button<{ $active: boolean }>`
  width: 32px;
  height: 18px;
  flex: 0 0 auto;
  position: relative;
  padding: 0;
  background: ${({ $active }) => ($active ? "var(--accent)" : "var(--bg-elevated)")};
  border: 1px solid ${({ $active }) => ($active ? "var(--accent)" : "var(--border)")};
  border-radius: 999px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-primary);
    transform: translateX(${({ $active }) => ($active ? "14px" : "0")});
    transition: transform 120ms ease;
  }

  &:hover {
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;

  input {
    accent-color: var(--accent);
  }
`;

export const StatusDot = styled.span<{ $running: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => (p.$running ? "var(--success)" : "var(--danger)")};
  flex-shrink: 0;
`;

export const NestedToolList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-xs);
  margin-top: var(--space-xs);

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

export const NestedToolCard = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  opacity: ${({ $active }) => ($active ? 1 : 0.55)};

  &[title] {
    cursor: help;
  }
`;

export const ToolName = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
`;

export const ToolDescription = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
`;

export const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
`;

export const OverrideMark = styled.span`
  font-size: 14px;
  line-height: 1;
`;

export const IconActionButton = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    color: var(--accent);
  }
`;

export const ScopeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
`;
