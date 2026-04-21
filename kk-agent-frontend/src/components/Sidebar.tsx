import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Spinner from "@/components/Spinner";
import { agent as agentApi, session as sessionApi } from "@/lib/api";
import CreateSessionModal from "@/components/chat/CreateSessionModal";
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
import { createAndActivateSession, type SessionCreationContext, resolveSessionCreationContext } from "@/lib/sessionFactory";
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
  SessionMeta,
  SessionActivity,
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
  const [serverRunningSessionIds, setServerRunningSessionIds] = useState<string[]>([]);
  const [clientRunningSessionIds, setClientRunningSessionIds] = useState<string[]>(getRunningChatStreamSessionIds());
  const [sessionCreateContext, setSessionCreateContext] = useState<SessionCreationContext | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const activeSessionId = useStoredActiveSessionId();
  const collapsed = useStoredSidebarCollapsed();

  const loadSessions = useCallback(async () => {
    try {
      const nextSessions = await sessionApi.list();
      setSessions(nextSessions);
      const runningStates = await Promise.all(nextSessions.map(async (session) => {
        try {
          const state = await agentApi.loopState(session.id);
          return state.status === "running" ? session.id : null;
        } catch {
          return null;
        }
      }));
      setServerRunningSessionIds(runningStates.filter((sessionId): sessionId is string => Boolean(sessionId)));
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
      const context = await resolveSessionCreationContext([], fallbackAgentId);
      if (context.requiresProviderSelection) {
        setSessionCreateContext(context);
        return;
      }

      setCreatingSession(true);
      await createAndActivateSession([], fallbackAgentId, context.selectedProviderId);
      await loadSessions();
      await router.push("/chat");
    } catch (err) {
      console.error("[sidebar-create-session]", err);
    } finally {
      setCreatingSession(false);
    }
  }

  async function createSessionWithProvider(providerId: string) {
    try {
      const fallbackAgentId = sessionCreateContext?.agentId ?? sessions.find((session) => session.id === activeSessionId)?.agentId ?? sessions[0]?.agentId;
      setCreatingSession(true);
      await createAndActivateSession([], fallbackAgentId, providerId);
      setSessionCreateContext(null);
      await loadSessions();
      await router.push("/chat");
    } catch (err) {
      console.error("[sidebar-create-session-provider]", err);
    } finally {
      setCreatingSession(false);
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
      console.error("[sidebar-delete-session]", err);
    }
  }

  const runningSessionIds = new Set([...serverRunningSessionIds, ...clientRunningSessionIds]);

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
      <CreateSessionModal
        open={sessionCreateContext !== null}
        context={sessionCreateContext}
        creating={creatingSession}
        onCreate={(providerId) => { void createSessionWithProvider(providerId); }}
        onClose={() => setSessionCreateContext(null)}
      />
    </SidebarWrapper>
  );
}
