import styled from "styled-components";

export const PageWrapper = styled.div`
  max-width: 920px;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding-bottom: var(--space-xl);
`;

export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
`;

export const PanelTitle = styled.h2`
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
`;

export const Hint = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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
    border-color: var(--accent);
  }
`;

export const SaveMsg = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

export const SectionTitle = styled.h3`
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--text-primary);
`;

export const SectionCardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
`;

export const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
`;

export const SectionToggleMeta = styled.span`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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
