import styled from "styled-components";

export const MasterDetailLayout = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  min-height: 0;

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

export const SidebarList = styled.div`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  @media (max-width: 900px) {
    width: 100%;
  }
`;

export const SidebarItem = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-md);
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "var(--bg-elevated)")};
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  color: inherit;

  &:hover {
    border-color: var(--accent);
  }
`;

export const SidebarItemTitle = styled.div`
  font-weight: 600;
  color: var(--text-primary);
`;

export const SidebarItemDescription = styled.div`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

export const SidebarMeta = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
  flex-wrap: wrap;
`;
