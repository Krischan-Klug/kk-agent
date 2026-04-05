import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { session as sessionApi } from "@/lib/api";
import type { SessionState } from "@/types/api";
import { addAppEventListener, emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import {
  clearActiveSessionId,
  setActiveSessionId as persistActiveSessionId,
  setSidebarCollapsed as persistSidebarCollapsed,
  useStoredActiveSessionId,
  useStoredSidebarCollapsed,
} from "@/lib/sessionState";
import { createAndActivateSession } from "@/lib/sessionFactory";
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
  SessionDelete,
} from "./Sidebar.styled";

const CHAT_EMOJI = "\u{1F4AC}";
const AGENT_EMOJI = "\u{1F916}";
const SKILL_EMOJI = "\u{1F4DA}";
const MCP_EMOJI = "\u{1F9E9}";
const SETTINGS_EMOJI = "\u2699\uFE0F";

const navItems = [
  { href: "/chat", emoji: CHAT_EMOJI, label: "Chat" },
  { href: "/agent", emoji: AGENT_EMOJI, label: "Agents" },
  { href: "/skills", emoji: SKILL_EMOJI, label: "Skills" },
  { href: "/mcp", emoji: MCP_EMOJI, label: "MCP" },
  { href: "/settings/defaults", emoji: SETTINGS_EMOJI, label: "Settings" },
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
  const activeSessionId = useStoredActiveSessionId();
  const collapsed = useStoredSidebarCollapsed();

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await sessionApi.list());
    } catch {
      // ignore
    }
  }, [setSessions]);

  const syncSessionState = useCallback(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadSessions();
    }, 0);

    const unsubscribe = addAppEventListener(SESSION_CHANGED_EVENT, syncSessionState);
    window.addEventListener("storage", syncSessionState);
    return () => {
      window.clearTimeout(loadTimer);
      unsubscribe();
      window.removeEventListener("storage", syncSessionState);
    };
  }, [loadSessions, syncSessionState]);

  function updateSidebarCollapsed(next: boolean) {
    persistSidebarCollapsed(next);
  }

  function selectSession(id: string) {
    persistActiveSessionId(id);
    emitAppEvent(SESSION_CHANGED_EVENT);
    void router.push("/chat");
  }

  async function createSession() {
    try {
      const fallbackAgentId = sessions.find((session) => session.id === activeSessionId)?.agentId ?? sessions[0]?.agentId;
      await createAndActivateSession([], fallbackAgentId);
      await loadSessions();
      await router.push("/chat");
    } catch (err) {
      logUiError("sidebar-create-session", err);
    }
  }

  async function deleteSession(id: string) {
    try {
      await sessionApi.delete(id);
      if (activeSessionId === id) {
        clearActiveSessionId();
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
            <SessionAdd type="button" aria-label="Neue Session" title="Neue Session" onClick={() => void createSession()}>
              +
            </SessionAdd>
          </SidebarSectionActions>
        </SidebarSectionRow>
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            $collapsed={collapsed}
            $active={session.id === activeSessionId}
            onClick={() => selectSession(session.id)}
          >
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
