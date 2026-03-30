import styled from "styled-components";

export const SidebarWrapper = styled.nav`
  width: var(--sidebar-width);
  min-height: 100%;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: var(--space-md) 0;
`;

export const Logo = styled.div`
  padding: var(--space-sm) var(--space-lg);
  margin-bottom: var(--space-lg);
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
`;

export const NavItem = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 2px solid ${(p) => (p.$active ? "var(--accent)" : "transparent")};
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
`;

export const SidebarDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--border);
  margin: var(--space-md) var(--space-lg);
`;

export const SidebarSection = styled.div`
  padding: var(--space-xs) var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const SidebarSectionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: var(--space-lg);
`;

export const SidebarSectionActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
`;

export const SessionAdd = styled.button`
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  flex: 0 0 auto;
  transform: translateX(1px);

  &:hover {
    color: var(--text-primary);
  }
`;

export const SessionDebug = styled.button`
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  flex: 0 0 auto;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &:hover {
    color: var(--text-primary);
  }
`;

export const SessionItem = styled.a<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-lg);
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 2px solid ${(p) => (p.$active ? "var(--accent)" : "transparent")};
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &:hover button,
  &:focus-within button {
    opacity: 1;
  }
`;

export const SessionName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SessionDelete = styled.button`
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  transform: translateX(-1px);

  &:hover {
    color: var(--text-primary);
  }
`;
