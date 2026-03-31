import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { session as sessionApi } from "@/lib/api";
import type { SessionState } from "@/types/api";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getSidebarCollapsed,
  setActiveSessionId as persistActiveSessionId,
  setSidebarCollapsed as persistSidebarCollapsed,
} from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { logUiError } from "@/lib/uiLogger";
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

const navLinkStyle = { textDecoration: "none" };

function isNavActive(pathname: string, href: string): boolean {
  return (
    (href === "/chat" && (pathname === "/" || pathname === "/chat")) ||
    (href.startsWith("/settings") && pathname.startsWith("/settings")) ||
    (href !== "/chat" && !href.startsWith("/settings") && pathname === href)
  );
}

export default function Sidebar() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await sessionApi.list());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSessions();
    setActiveSessionIdState(getActiveSessionId());
    setCollapsed(getSidebarCollapsed());

    function syncSessionState() {
      void loadSessions();
      setActiveSessionIdState(getActiveSessionId());
    }

    const unsubscribe = addAppEventListener(SESSION_CHANGED_EVENT, syncSessionState);
    window.addEventListener("storage", syncSessionState);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", syncSessionState);
    };
  }, [loadSessions]);

  function updateSidebarCollapsed(next: boolean) {
    setCollapsed(next);
    persistSidebarCollapsed(next);
  }

  function selectSession(id: string) {
    persistActiveSessionId(id);
    setActiveSessionIdState(id);
    emitAppEvent(SESSION_CHANGED_EVENT);
    void router.push("/chat");
  }

  async function createSession() {
    try {
      const fallbackAgentId = resolveDefaultSessionAgentId(
        [],
        sessions.find((session) => session.id === activeSessionId)?.agentId ?? sessions[0]?.agentId,
      );
      const newSession = await createAndActivateSession([], fallbackAgentId);
      setActiveSessionIdState(newSession.id);
      await loadSessions();
      await router.push("/chat");
    } catch (err) {
      logUiError("sidebar-create-session", err);
    }
  }

  async function deleteSession(id: string) {
    try {
      await sessionApi.delete(id);
      if (getActiveSessionId() === id) {
        clearActiveSessionId();
        setActiveSessionIdState(null);
      }
      emitAppEvent(SESSION_CHANGED_EVENT);
      await loadSessions();
      if (router.pathname === "/chat") await router.replace("/chat");
    } catch (err) {
      logUiError("sidebar-delete-session", err);
    }
  }

  return (
    <SidebarWrapper $collapsed={collapsed} onClick={() => collapsed && updateSidebarCollapsed(false)}>
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
            updateSidebarCollapsed(!collapsed);
          }}
        >
          {collapsed ? ">" : "<"}
        </SidebarToggle>
      </LogoRow>

      {navItems.map((item) => (
        <Link key={item.href} href={item.href} style={navLinkStyle}>
          <NavItem $collapsed={collapsed} $active={isNavActive(router.pathname, item.href)}>
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
                onClick={() => emitAppEvent(CHAT_DEBUG_TOGGLE_EVENT)}
              >
                Debug
              </SessionDebug>
            )}
            <SessionAdd type="button" aria-label="Neue Session" title="Neue Session" onClick={() => void createSession()}>
              +
            </SessionAdd>
          </SidebarSectionActions>
        </SidebarSectionRow>
        {sessions.map((session) => (
          <SessionItem key={session.id} $collapsed={collapsed} $active={session.id === activeSessionId} onClick={() => selectSession(session.id)}>
            <SessionName>{session.name || session.id.slice(0, 8)}</SessionName>
            <SessionDelete
              type="button"
              aria-label="Session loeschen"
              title="Session loeschen"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void deleteSession(session.id);
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
