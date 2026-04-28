import styled from "styled-components";
import { FormRow } from "@/components/PageForm";

export const EditorArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
`;

export const Select = styled.select`
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--border-focus);
  }
`;

export const ModeTabs = styled.div`
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
`;

export const ModeTab = styled.button<{ $active: boolean }>`
  padding: 6px 10px;
  background: ${(p) => (p.$active ? "var(--accent)" : "var(--accent-muted)")};
  color: ${(p) => (p.$active ? "var(--bg-base)" : "var(--accent)")};
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
`;

export const ModeTabContent = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const ModeStatusDot = styled.span<{ $enabled: boolean; $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $enabled, $active }) => {
    if ($enabled) {
      return $active ? "var(--bg-base)" : "var(--success)";
    }
    return "var(--text-muted)";
  }};
  opacity: ${({ $enabled }) => ($enabled ? 1 : 0.85)};
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

export const CapabilityHeader = styled(FormRow)`
  justify-content: space-between;
  align-items: center;
`;

export const HeaderActions = styled(FormRow)`
  align-items: center;
  gap: var(--space-xs);
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

export const ExpandButton = styled.button`
  padding: 2px 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }
`;

export const NestedToolList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-xs);
  margin-top: var(--space-xs);
`;

export const NestedToolCard = styled.div<{ $active: boolean }>`
  padding: var(--space-sm);
  background: var(--bg-elevated);
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-sm);
  opacity: ${(p) => (p.$active ? 1 : 0.6)};
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

export const InlineSelect = styled.select`
  padding: 4px 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--accent);
  }
`;

export const ScopeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
`;
