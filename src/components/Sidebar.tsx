import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { session as sessionApi } from "@/lib/api";
import type { SessionState } from "@/types/api";
import {
  SidebarWrapper,
  LogoRow,
  Logo,
  CompactLogo,
  SidebarToggle,
  NavItem,
  NavEmoji,
  NavLabel,
  SidebarDivider,
  SidebarSection,
  SidebarSectionRow,
  SidebarSectionActions,
  SessionItem,
  SessionName,
  SessionAdd,
  SessionDebug,
  SessionDelete,
} from "./Sidebar.styled";

const navItems = [
  { href: "/chat", emoji: "💬", label: "Chat" },
  { href: "/agent", emoji: "🤖", label: "Agents" },
  { href: "/mcp", emoji: "🛠️", label: "MCP" },
  { href: "/provider", emoji: "🔌", label: "Provider" },
  { href: "/settings/defaults", emoji: "⚙️", label: "Settings" },
];

export default function Sidebar() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const data = await sessionApi.list();
      setSessions(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSessions();
    setActiveSessionId(localStorage.getItem("activeSessionId"));
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setCollapsed(stored === "true");
    }

    function onSessionChanged() {
      loadSessions();
      setActiveSessionId(localStorage.getItem("activeSessionId"));
    }

    window.addEventListener("session-changed", onSessionChanged);
    window.addEventListener("storage", onSessionChanged);
    return () => {
      window.removeEventListener("session-changed", onSessionChanged);
      window.removeEventListener("storage", onSessionChanged);
    };
  }, [loadSessions]);

  function setSidebarCollapsed(next: boolean) {
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function selectSession(id: string) {
    localStorage.setItem("activeSessionId", id);
    setActiveSessionId(id);
    window.dispatchEvent(new Event("session-changed"));
    router.push("/chat");
  }

  async function createSession() {
    try {
      const fallbackAgentId =
        sessions.find((session) => session.id === activeSessionId)?.agentId ??
        sessions[0]?.agentId ??
        "general-assistant";
      const newSession = await sessionApi.create({ agentId: fallbackAgentId });
      localStorage.setItem("activeSessionId", newSession.id);
      setActiveSessionId(newSession.id);
      window.dispatchEvent(new Event("session-changed"));
      await loadSessions();
      router.push("/chat");
    } catch {
      // ignore
    }
  }

  async function deleteSession(id: string) {
    try {
      await sessionApi.delete(id);
      if (localStorage.getItem("activeSessionId") === id) {
        localStorage.removeItem("activeSessionId");
        setActiveSessionId(null);
      }
      window.dispatchEvent(new Event("session-changed"));
      await loadSessions();
      if (router.pathname === "/chat") {
        router.replace("/chat");
      }
    } catch {
      // ignore
    }
  }

  return (
    <SidebarWrapper
      $collapsed={collapsed}
      onClick={() => {
        if (collapsed) setSidebarCollapsed(false);
      }}
    >
      <LogoRow $collapsed={collapsed}>
        <CompactLogo $collapsed={collapsed}>^^</CompactLogo>
        <Logo $collapsed={collapsed}>^^</Logo>
        <SidebarToggle
          $collapsed={collapsed}
          type="button"
          aria-label={collapsed ? "Sidebar aufklappen" : "Sidebar einklappen"}
          title={collapsed ? "Sidebar aufklappen" : "Sidebar einklappen"}
          onClick={(e) => {
            e.stopPropagation();
            setSidebarCollapsed(!collapsed);
          }}
        >
          {collapsed ? ">" : "<"}
        </SidebarToggle>
      </LogoRow>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
          <NavItem
            $collapsed={collapsed}
            $active={
              (item.href === "/chat" && (router.pathname === "/" || router.pathname === "/chat")) ||
              (item.href.startsWith("/settings") && router.pathname.startsWith("/settings")) ||
              (item.href !== "/chat" && !item.href.startsWith("/settings") && router.pathname === item.href)
            }
          >
            <NavEmoji>{item.emoji}</NavEmoji>
            <NavLabel $collapsed={collapsed}>{item.label}</NavLabel>
          </NavItem>
        </Link>
      ))}

      <>
        <SidebarDivider />
        <SidebarSectionRow $collapsed={collapsed}>
          <SidebarSection $collapsed={collapsed}>Sessions</SidebarSection>
          <SidebarSectionActions>
            {router.pathname === "/chat" && (
              <SessionDebug
                type="button"
                aria-label="Debug umschalten"
                title="Debug umschalten"
                onClick={() => window.dispatchEvent(new Event("chat-debug-toggle"))}
              >
                Debug
              </SessionDebug>
            )}
            <SessionAdd type="button" aria-label="Neue Session" title="Neue Session" onClick={() => void createSession()}>
              +
            </SessionAdd>
          </SidebarSectionActions>
        </SidebarSectionRow>
        {sessions.map((s) => (
          <SessionItem key={s.id} $collapsed={collapsed} $active={s.id === activeSessionId} onClick={() => selectSession(s.id)}>
            <SessionName>{s.name || s.id.slice(0, 8)}</SessionName>
            <SessionDelete
              type="button"
              aria-label="Session loeschen"
              title="Session loeschen"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void deleteSession(s.id);
              }}
            >
              x
            </SessionDelete>
          </SessionItem>
        ))}
      </>
    </SidebarWrapper>
  );
}
