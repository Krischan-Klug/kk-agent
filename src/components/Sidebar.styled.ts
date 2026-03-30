import styled from "styled-components";

export const SidebarWrapper = styled.nav<{ $collapsed: boolean }>`
  width: ${(p) => (p.$collapsed ? "64px" : "var(--sidebar-width)")};
  min-height: 100%;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: var(--space-md) 0;
  transition: width 0.18s ease;
`;

export const LogoRow = styled.div<{ $collapsed: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: ${(p) => (p.$collapsed ? "center" : "space-between")};
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  margin-bottom: var(--space-lg);
`;

export const Logo = styled.div<{ $collapsed: boolean }>`
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  transform: ${(p) => (p.$collapsed ? "translateX(-8px) scale(0.96)" : "translateX(0) scale(1)")};
  overflow: hidden;
  transition: opacity 0.18s ease, transform 0.18s ease;
`;

export const CompactLogo = styled.div<{ $collapsed: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
  opacity: ${(p) => (p.$collapsed ? 1 : 0)};
  transition: opacity 0.12s ease;
  pointer-events: none;
`;

export const SidebarToggle = styled.button<{ $collapsed: boolean }>`
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  flex: 0 0 auto;
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  pointer-events: ${(p) => (p.$collapsed ? "none" : "auto")};
  transition: opacity 0.12s ease;

  &:hover {
    color: var(--text-primary);
  }
`;

export const NavItem = styled.div<{ $active?: boolean; $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  justify-content: ${(p) => (p.$collapsed ? "center" : "flex-start")};
  padding: ${(p) => (p.$collapsed ? "var(--space-sm) 0" : "var(--space-sm) var(--space-lg)")};
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

export const NavEmoji = styled.span`
  flex: 0 0 auto;
  line-height: 1;
`;

export const NavLabel = styled.span<{ $collapsed: boolean }>`
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  width: ${(p) => (p.$collapsed ? "0" : "auto")};
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 0.15s ease, width 0.15s ease;
`;

export const SidebarDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--border);
  margin: var(--space-md) var(--space-lg);
`;

export const SidebarSection = styled.div<{ $collapsed?: boolean }>`
  padding: ${(p) => (p.$collapsed ? "0" : "var(--space-xs) var(--space-lg)")};
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  height: ${(p) => (p.$collapsed ? "0" : "auto")};
  overflow: hidden;
`;

export const SidebarSectionRow = styled.div<{ $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: var(--space-lg);
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  height: ${(p) => (p.$collapsed ? "0" : "auto")};
  overflow: hidden;
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

export const SessionItem = styled.a<{ $active?: boolean; $collapsed?: boolean }>`
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

  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  height: ${(p) => (p.$collapsed ? "0" : "auto")};
  min-height: ${(p) => (p.$collapsed ? "0" : "unset")};
  padding-top: ${(p) => (p.$collapsed ? "0" : "var(--space-xs)")};
  padding-bottom: ${(p) => (p.$collapsed ? "0" : "var(--space-xs)")};
  overflow: hidden;
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
