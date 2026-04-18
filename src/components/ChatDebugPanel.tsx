import { useEffect, useState } from "react";
import styled from "styled-components";
import type {
  McpListItem,
  SessionState,
  TaskItem,
  MemoryFact,
  AgentLoopState,
  SkillDefinition,
  SessionRuntimeMcpDebug,
  SessionRuntimeSkillDebug,
  SessionRuntimeToolDebug,
} from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import CapabilitySelect from "@/components/CapabilitySelect";
import SelectMenu, { type SelectMenuOption } from "@/components/SelectMenu";

export type ChatDebugTab = "prompt" | "meta" | "tools" | "mcps" | "skills" | "session" | "messages" | "tasks" | "memory";

const DebugPanel = styled.div`
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  margin-bottom: var(--space-md);
  overflow: hidden;
  flex-shrink: 0;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
`;

const DebugTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
`;

const DebugTab = styled.button<{ $active?: boolean }>`
  background: ${({ $active }) => ($active ? "var(--bg-surface)" : "none")};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--accent)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--text-primary)" : "var(--text-muted)")};
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  font-family: var(--font-mono);

  &:hover {
    color: var(--text-primary);
  }
`;

const DebugControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  margin-left: auto;
`;

const DebugContent = styled.pre`
  margin: 0;
  padding: var(--space-md);
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  flex: 1;
`;

const EditorWrap = styled.div`
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
  flex: 1;
`;

const TaskRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px minmax(0, 1fr) auto;
  gap: var(--space-sm);
  align-items: start;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const InlineSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  outline: none;

  &:focus {
    border-color: var(--border-focus);
  }
`;

const RowActions = styled.div`
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

type Props = {
  open: boolean;
  debugTab: ChatDebugTab | null;
  onTabChange: (tab: ChatDebugTab | null) => void;
  session: SessionState | null;
  loopState: AgentLoopState | null;
  debugPrompt: string | null;
  debugMetaMessages: string[] | null;
  debugRuntimeTools: SessionRuntimeToolDebug[] | null;
  debugRuntimeMcps: SessionRuntimeMcpDebug[] | null;
  debugRuntimeSkills: SessionRuntimeSkillDebug[] | null;
  internalTools: McpListItem[];
  debugMcps: McpListItem[];
  skills: SkillDefinition[];
  debugTasks: TaskItem[];
  debugSessionFacts: MemoryFact[];
  debugUserFacts: MemoryFact[];
  models: string[];
  onModelSwitch: (model: string) => void;
  onToolToggle: (toolId: string, enabled: boolean) => void;
  onMcpToggle: (mcpId: string, enabled: boolean) => void;
  onSkillToggle: (skillId: string, enabled: boolean) => void;
  onSaveTasks: (tasks: TaskItem[]) => Promise<void>;
  onSaveSessionFacts: (facts: MemoryFact[]) => Promise<void>;
  onSaveUserFacts: (facts: MemoryFact[]) => Promise<void>;
  showReasoningControl: boolean;
  showTemperatureControl: boolean;
  resolvedEffort: string;
  resolvedTemp: number;
  reasoningOptions: SelectMenuOption[];
  temperatureOptions: SelectMenuOption[];
  onReasoningSelect: (value: string) => void;
  onTemperatureSelect: (value: string) => void;
};

function parseFactsDraft(value: string): MemoryFact[] {
  return value
    .split("\n")
    .map((line, index) => ({ id: `fact-${index + 1}`, text: line.trim() }))
    .filter((fact) => fact.text.length > 0);
}

function toFactDraft(facts: MemoryFact[]): string {
  return facts.map((fact) => fact.text).join("\n");
}

export default function ChatDebugPanel({
  open,
  debugTab,
  onTabChange,
  session,
  loopState,
  debugPrompt,
  debugMetaMessages,
  debugRuntimeTools,
  debugRuntimeMcps,
  debugRuntimeSkills,
  internalTools,
  debugMcps,
  skills,
  debugTasks,
  debugSessionFacts,
  debugUserFacts,
  models,
  onModelSwitch,
  onToolToggle,
  onMcpToggle,
  onSkillToggle,
  onSaveTasks,
  onSaveSessionFacts,
  onSaveUserFacts,
  showReasoningControl,
  showTemperatureControl,
  resolvedEffort,
  resolvedTemp,
  reasoningOptions,
  temperatureOptions,
  onReasoningSelect,
  onTemperatureSelect,
}: Props) {
  const [taskDraft, setTaskDraft] = useState<TaskItem[]>(debugTasks);
  const [sessionMemoryDraft, setSessionMemoryDraft] = useState(toFactDraft(debugSessionFacts));
  const [userMemoryDraft, setUserMemoryDraft] = useState(toFactDraft(debugUserFacts));
  const [saving, setSaving] = useState<"tasks" | "session" | "user" | null>(null);

  useEffect(() => setTaskDraft(debugTasks), [debugTasks]);
  useEffect(() => setSessionMemoryDraft(toFactDraft(debugSessionFacts)), [debugSessionFacts]);
  useEffect(() => setUserMemoryDraft(toFactDraft(debugUserFacts)), [debugUserFacts]);

  if (!open || !session) return null;

  function updateTask(index: number, patch: Partial<TaskItem>) {
    setTaskDraft((prev) => prev.map((task, i) => (i === index ? { ...task, ...patch } : task)));
  }

  function addTask() {
    setTaskDraft((prev) => [...prev, { id: `task-${Date.now()}`, title: "", status: "pending", notes: "" }]);
  }

  function removeTask(index: number) {
    setTaskDraft((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveTasks() {
    setSaving("tasks");
    try {
      await onSaveTasks(taskDraft);
    } finally {
      setSaving(null);
    }
  }

  async function saveSessionMemory() {
    setSaving("session");
    try {
      await onSaveSessionFacts(parseFactsDraft(sessionMemoryDraft));
    } finally {
      setSaving(null);
    }
  }

  async function saveUserMemory() {
    setSaving("user");
    try {
      await onSaveUserFacts(parseFactsDraft(userMemoryDraft));
    } finally {
      setSaving(null);
    }
  }

  let content = "";

  function renderRuntimeTools(tools: SessionRuntimeToolDebug[] | null): string {
    if (tools === null) return "Lade...";
    if (tools.length === 0) return "Keine aktuell verfuegbaren Runtime-Tools.";
    return tools
      .map((tool) => {
        const params = tool.inputSchema?.properties
          ? Object.entries(tool.inputSchema.properties as Record<string, { type?: string; description?: string }>)
              .map(([key, value]) => `    ${key}: ${value.type ?? "any"} - ${value.description ?? ""}`)
              .join("\n")
          : "    (keine Parameter)";
        return `-- ${tool.name} [${tool.source}:${tool.capabilityId}] --\n${tool.description}\n${params}`;
      })
      .join("\n\n");
  }

  function renderRuntimeMcps(mcps: SessionRuntimeMcpDebug[] | null): string {
    if (mcps === null) return "Lade...";
    if (mcps.length === 0) return "Keine aktuell verfuegbaren Runtime-MCPs.";
    return mcps
      .map((mcp) => {
        const header = `-- ${mcp.emoji || "🔌"} ${mcp.name} (${mcp.id}) --`;
        const tools = mcp.tools.length === 0
          ? "  (keine Tools)"
          : mcp.tools.map((tool) => {
              const params = tool.inputSchema?.properties
                ? Object.entries(tool.inputSchema.properties as Record<string, { type?: string; description?: string }>)
                    .map(([key, value]) => `    ${key}: ${value.type ?? "any"} - ${value.description ?? ""}`)
                    .join("\n")
                : "    (keine Parameter)";
              return `  ${tool.name}\n    ${tool.description ?? ""}\n${params}`;
            }).join("\n\n");
        return `${header}\nsource=${mcp.source ?? "custom"} active=${mcp.active} running=${mcp.running}\n${mcp.instruction}\n\n${tools}`;
      })
      .join("\n\n");
  }

  function renderRuntimeSkills(skillsSnapshot: SessionRuntimeSkillDebug[] | null): string {
    if (skillsSnapshot === null) return "Lade...";
    if (skillsSnapshot.length === 0) return "Keine aktuell aktiven Runtime-Skills.";
    return skillsSnapshot
      .map((skill) => {
        const toolRefs = skill.recommendedToolIds.length > 0
          ? `Tools: ${skill.recommendedToolIds.join(", ")}`
          : "Tools: -";
        const mcpRefs = skill.recommendedMcpIds.length > 0
          ? `MCPs: ${skill.recommendedMcpIds.join(", ")}`
          : "MCPs: -";
        const modes = `Modes: ${skill.allowedModes.join(", ")}`;
        return `-- ${skill.name} (${skill.id}) --\nsource=${skill.source ?? "custom"} active=${skill.active}\n${skill.description}\n${toolRefs}\n${mcpRefs}\n${modes}\n\n${skill.instruction}`;
      })
      .join("\n\n");
  }

  if (debugTab === "prompt") {
    content = debugPrompt ?? "Lade...";
  } else if (debugTab === "meta") {
    content = debugMetaMessages === null
      ? "Lade..."
      : debugMetaMessages.length === 0
        ? "Keine aktuellen Meta-Messages."
        : debugMetaMessages.join("\n\n");
  } else if (debugTab === "tools") {
    content = renderRuntimeTools(debugRuntimeTools);
  } else if (debugTab === "mcps") {
    content = renderRuntimeMcps(debugRuntimeMcps);
  } else if (debugTab === "skills") {
    content = renderRuntimeSkills(debugRuntimeSkills);
  } else if (debugTab === "session") {
    content = JSON.stringify(
      {
        id: session.id,
        name: session.name,
        model: session.model,
        agentId: session.agentId,
        activeToolIds: session.activeToolIds,
        activeMcpIds: session.activeMcpIds,
        activeSkillIds: session.activeSkillIds,
        activeMode: session.activeMode,
        reasoningEffort: session.reasoningEffort ?? "default",
        temperature: session.temperature ?? "default",
        providerDebug: session.providerDebug ?? null,
        messageCount: session.messages.length,
        loopMode: loopState?.mode ?? null,
        loopStatus: loopState?.status ?? null,
        createdAt: session.createdAt,
      },
      null,
      2,
    );
  } else if (debugTab === "messages") {
    const msgs = session.messages.slice(-10);
    content = msgs
      .map((m, i) => {
        const idx = session.messages.length - msgs.length + i;
        const role = m.role.toUpperCase();
        const preview = m.content
          .map((block) => {
            if (block.type === "text") return block.text;
            if (block.type === "reasoning") return `[reasoning] ${block.text}`;
            if (block.type === "tool_use") return `[tool_use:${block.name}] ${JSON.stringify(block.input)}`;
            if (block.type === "tool_result") return `[tool_result:${block.tool_use_id}] ${block.content}`;
            return `[attachment:${block.filename}]`;
          })
          .join("\n")
          .slice(0, 300) || "(leer)";
        return `[${idx}] ${role}\n  message_id: ${m.id}\n  ${preview}${preview.length >= 300 ? "..." : ""}`;
      })
      .join("\n\n");
  }

  function toggleTab(tab: ChatDebugTab) {
    onTabChange(debugTab === tab ? null : tab);
  }

  return (
    <DebugPanel>
      <DebugTabs>
        <DebugTab $active={debugTab === "prompt"} onClick={() => toggleTab("prompt")}>System Prompt</DebugTab>
        <DebugTab $active={debugTab === "meta"} onClick={() => toggleTab("meta")}>Meta</DebugTab>
        <DebugTab $active={debugTab === "tools"} onClick={() => toggleTab("tools")}>Tools</DebugTab>
        <DebugTab $active={debugTab === "mcps"} onClick={() => toggleTab("mcps")}>MCPs</DebugTab>
        <DebugTab $active={debugTab === "skills"} onClick={() => toggleTab("skills")}>Skills</DebugTab>
        <DebugTab $active={debugTab === "session"} onClick={() => toggleTab("session")}>Session</DebugTab>
        <DebugTab $active={debugTab === "messages"} onClick={() => toggleTab("messages")}>Messages</DebugTab>
        <DebugTab $active={debugTab === "tasks"} onClick={() => toggleTab("tasks")}>Tasks</DebugTab>
        <DebugTab $active={debugTab === "memory"} onClick={() => toggleTab("memory")}>Memory</DebugTab>
        <DebugControls>
          {loopState && <Badge variant="info">{loopState.mode}</Badge>}
          {models.length > 0 ? (
            <SelectMenu
              value={session.model}
              options={models.map((model) => ({ value: model, label: model }))}
              onSelect={onModelSwitch}
              mono
            />
          ) : (
            <Badge variant="info">{session.model}</Badge>
          )}
          {showReasoningControl && (
            <SelectMenu
              value={resolvedEffort}
              options={reasoningOptions}
              onSelect={onReasoningSelect}
              variant="neutral"
            />
          )}
          {showTemperatureControl && (
            <SelectMenu
              value={resolvedTemp.toFixed(1)}
              options={temperatureOptions}
              onSelect={onTemperatureSelect}
              variant="neutral"
            />
          )}
          <CapabilitySelect
            items={internalTools}
            activeIds={session.activeToolIds}
            onToggle={onToolToggle}
            kind="tool"
            label="Tools"
            emptyHint="Keine internen Tools gefunden"
          />
          <CapabilitySelect
            items={debugMcps}
            activeIds={session.activeMcpIds}
            onToggle={onMcpToggle}
            kind="mcp"
            label="MCPs"
            emptyHint="Keine MCP Server konfiguriert"
          />
          <CapabilitySelect
            items={skills}
            activeIds={session.activeSkillIds}
            onToggle={onSkillToggle}
            kind="skill"
            label="Skills"
            emptyHint="Keine Skills konfiguriert"
          />
        </DebugControls>
      </DebugTabs>

      {(debugTab === "prompt" || debugTab === "meta" || debugTab === "tools" || debugTab === "mcps" || debugTab === "skills" || debugTab === "session" || debugTab === "messages") && (
        <DebugContent>{content}</DebugContent>
      )}

      {debugTab === "tasks" && (
        <EditorWrap>
          {taskDraft.map((task, index) => (
            <TaskRow key={task.id}>
              <Input
                value={task.title}
                onChange={(e) => updateTask(index, { title: e.target.value })}
                placeholder="Task-Titel"
              />
              <InlineSelect
                value={task.status}
                onChange={(e) => updateTask(index, { status: e.target.value as TaskItem["status"] })}
              >
                <option value="pending">pending</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
              </InlineSelect>
              <Input
                value={task.notes ?? ""}
                onChange={(e) => updateTask(index, { notes: e.target.value })}
                placeholder="Notizen"
              />
              <Button variant="secondary" size="sm" onClick={() => removeTask(index)}>
                Entfernen
              </Button>
            </TaskRow>
          ))}
          <RowActions>
            <Button variant="secondary" size="sm" onClick={addTask}>Task hinzufuegen</Button>
            <Button size="sm" onClick={() => void saveTasks()} disabled={saving === "tasks"}>
              {saving === "tasks" ? "Speichert..." : "Tasks speichern"}
            </Button>
          </RowActions>
        </EditorWrap>
      )}

      {debugTab === "memory" && (
        <EditorWrap>
          <div>
            <TextArea
              value={sessionMemoryDraft}
              onChange={(e) => setSessionMemoryDraft(e.target.value)}
              placeholder={"Ein Fakt pro Zeile\nNur session-relevante Infos"}
            />
            <RowActions style={{ marginTop: "var(--space-sm)" }}>
              <Button size="sm" onClick={() => void saveSessionMemory()} disabled={saving === "session"}>
                {saving === "session" ? "Speichert..." : "Session Memory speichern"}
              </Button>
            </RowActions>
          </div>
          <div>
            <TextArea
              value={userMemoryDraft}
              onChange={(e) => setUserMemoryDraft(e.target.value)}
              placeholder={"Ein Fakt pro Zeile\nNur laengerfristige Nutzerinfos"}
            />
            <RowActions style={{ marginTop: "var(--space-sm)" }}>
              <Button size="sm" onClick={() => void saveUserMemory()} disabled={saving === "user"}>
                {saving === "user" ? "Speichert..." : "User Memory speichern"}
              </Button>
            </RowActions>
          </div>
        </EditorWrap>
      )}
    </DebugPanel>
  );
}
