import { useRouter } from "next/router";
import Link from "next/link";
import styled from "styled-components";
import { PageTitle } from "./Layout.styled";

const settingsNav = [
  { href: "/settings/defaults", label: "📋 Defaults" },
  { href: "/settings/appearance", label: "🎨 Appearance" },
  { href: "/settings/tools", label: "🛠️ Tools" },
  { href: "/settings/provider", label: "🔌 Provider" },
];

const Wrapper = styled.div`
  display: flex;
  gap: var(--space-lg);
  align-items: flex-start;
`;

const SubNav = styled.nav`
  width: 180px;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  position: sticky;
  top: var(--space-lg);
`;

const SubNavItem = styled.div<{ $active: boolean }>`
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-base);
  color: ${(p) => (p.$active ? "var(--accent)" : "var(--text-secondary)")};
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <Wrapper>
        <SubNav>
          {settingsNav.map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <SubNavItem $active={router.pathname === item.href}>{item.label}</SubNavItem>
            </Link>
          ))}
        </SubNav>
        <Content>{children}</Content>
      </Wrapper>
    </>
  );
}
