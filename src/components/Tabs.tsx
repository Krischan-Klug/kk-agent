import styled from "styled-components";

export const TabBar = styled.div`
  display: flex;
  gap: var(--space-xs);
`;

export const TabButton = styled.button<{ $active?: boolean }>`
  padding: 6px 16px;
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "var(--bg-elevated)")};
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-family: inherit;

  &:hover {
    border-color: var(--accent);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
