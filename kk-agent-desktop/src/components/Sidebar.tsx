import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Spinner from "@/components/Spinner";
import BrandMark from "@/components/BrandMark";
import SkillIcon from "@/components/SkillIcon";
import { session as sessionApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { getRunningChatStreamSessionIds, subscribeChatStreamStore } from "@/lib/chatStreamState";
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
import {
  SidebarWrapper,
  LogoRow,
  SidebarToggle,
  NavItem,
  NavIcon,
  NavLabel,
  SidebarDivider,
  SidebarSection,
  SidebarSectionRow,
  SidebarSectionActions,
  SessionItem,
  SessionMeta,
  SessionActivity,
  SessionName,
  SessionAdd,
  SessionDelete,
} from "./Sidebar.styled";

const logger = createLogger("sidebar");

const navItems = [
  { href: "/chat", Icon: ChatIcon, label: "Chat" },
  { href: "/agent", Icon: BrandMark, label: "Agents" },
  { href: "/skills", Icon: SkillIcon, label: "Skills" },
  { href: "/mcp", Icon: McpIcon, label: "MCP" },
  { href: "/settings/security", Icon: SettingsIcon, label: "Settings" },
];

function ChatIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>;
}

function McpIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v5m6-5v5M7 12h10v3a3 3 0 0 1-3 3h-1v3m-2-3H10a3 3 0 0 1-3-3v-3ZM8 4h2v3H8zm6 0h2v3h-2z" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="6" /><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.4-6.4-2.1 2.1M7.7 16.3l-2.1 2.1m12.8 0-2.1-2.1M7.7 7.7 5.6 5.6" /></svg>;
}

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
  const [serverRunningSessionIds, setServerRunningSessionIds] = useState<string[]>([]);
  const [clientRunningSessionIds, setClientRunningSessionIds] = useState<string[]>(getRunningChatStreamSessionIds());
  const activeSessionId = useStoredActiveSessionId();
  const collapsed = useStoredSidebarCollapsed();

  const loadSessions = useCallback(async () => {
    try {
      const nextSessions = await sessionApi.list();
      setSessions(nextSessions);
      setServerRunningSessionIds(nextSessions
        .filter((session) => session.runs.some((run) => run.status === "running"))
        .map((session) => session.id));
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
    const unsubscribeStreamStore = subscribeChatStreamStore(() => {
      setClientRunningSessionIds(getRunningChatStreamSessionIds());
    });
    window.addEventListener("storage", syncSessionState);
    return () => {
      window.clearTimeout(loadTimer);
      unsubscribe();
      unsubscribeStreamStore();
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
      logger.error("Failed to create session:", err);
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
      logger.error("Failed to delete session:", err);
    }
  }

  const runningSessionIds = new Set([...serverRunningSessionIds, ...clientRunningSessionIds]);

  return (
    <SidebarWrapper $collapsed={collapsed} onClick={() => collapsed && updateSidebarCollapsed(false)}>
      <LogoRow $collapsed={collapsed}>
        <SidebarToggle
          $collapsed={collapsed}
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
            <NavIcon><item.Icon /></NavIcon>
            <NavLabel $collapsed={collapsed}>{item.label}</NavLabel>
          </NavItem>
        </Link>
      ))}

      <>
        <SidebarDivider />
        <SidebarSectionRow $collapsed={collapsed}>
          <SidebarSection $collapsed={collapsed}>Sessions</SidebarSection>
          <SidebarSectionActions>
            <SessionAdd type="button" aria-label="New session" title="New session" onClick={() => void createSession()}>
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
            <SessionMeta>
              <SessionName>{session.name || session.id.slice(0, 8)}</SessionName>
              {runningSessionIds.has(session.id) && (
                <SessionActivity>
                  <Spinner size={12} />
                </SessionActivity>
              )}
            </SessionMeta>
            <SessionDelete
              type="button"
              aria-label="Delete session"
              title="Delete session"
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
