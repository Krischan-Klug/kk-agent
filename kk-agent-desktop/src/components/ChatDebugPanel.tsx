import { useEffect, useState } from "react";
import styled from "styled-components";
import type {
  LlmRequestConfig,
  McpListItem,
  SessionState,
  TaskItem,
  MemoryFact,
  AgentLoopState,
  RunEvent,
  ModelInputDebug,
  HarnessInstructionDebug,
  SkillDefinition,
  SessionRuntimeMcpDebug,
  SessionRuntimeSkillDebug,
  SessionRuntimeToolDebug,
} from "@/types/api";
import { compactLlmRequestConfig } from "@/lib/llmRequestConfig";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import CapabilitySelect from "@/components/CapabilitySelect";
import SamplingSettings from "@/components/SamplingSettings";
import SelectMenu, { type SelectMenuOption } from "@/components/SelectMenu";
import { InputLikeSelect } from "@/components/FormControls.styled";
import { getSessionModelRef } from "@/lib/modelRefs";

export type ChatDebugTab = "model-input" | "prompt" | "runtime" | "harness" | "tools" | "mcps" | "skills" | "runs" | "session" | "messages" | "tasks" | "memory";

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
  streamRunEvents: RunEvent[];
  debugPrompt: string | null;
  debugRuntimeContext: string | null;
  debugRuntimeTools: SessionRuntimeToolDebug[] | null;
  debugRuntimeMcps: SessionRuntimeMcpDebug[] | null;
  debugRuntimeSkills: SessionRuntimeSkillDebug[] | null;
  debugModelInputs: ModelInputDebug[] | null;
  debugHarnessInstructions: HarnessInstructionDebug[] | null;
  debugRuntimeDiagnostics: Record<string, unknown> | null;
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
  resolvedReasoningHistory: string;
  resolvedTemp: number;
  reasoningOptions: SelectMenuOption[];
  temperatureOptions: SelectMenuOption[];
  onReasoningSelect: (value: string) => void;
  onReasoningHistorySelect: (value: string) => void;
  onTemperatureSelect: (value: string) => void;
  onLlmRequestConfigChange: (value: LlmRequestConfig | undefined) => void;
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

function renderToolParameters(inputSchema?: { properties?: unknown }): string {
  const properties = inputSchema?.properties as Record<string, { type?: string; description?: string }> | undefined;
  return properties
    ? Object.entries(properties)
        .map(([key, value]) => `    ${key}: ${value.type ?? "any"} - ${value.description ?? ""}`)
        .join("\n")
    : "    (no parameters)";
}

export default function ChatDebugPanel({
  open,
  debugTab,
  onTabChange,
  session,
  loopState,
  streamRunEvents,
  debugPrompt,
  debugRuntimeContext,
  debugRuntimeTools,
  debugRuntimeMcps,
  debugRuntimeSkills,
  debugModelInputs,
  debugHarnessInstructions,
  debugRuntimeDiagnostics,
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
  resolvedReasoningHistory,
  resolvedTemp,
  reasoningOptions,
  temperatureOptions,
  onReasoningSelect,
  onReasoningHistorySelect,
  onTemperatureSelect,
  onLlmRequestConfigChange,
}: Props) {
  const [taskDraft, setTaskDraft] = useState<TaskItem[]>(debugTasks);
  const [sessionMemoryDraft, setSessionMemoryDraft] = useState(toFactDraft(debugSessionFacts));
  const [userMemoryDraft, setUserMemoryDraft] = useState(toFactDraft(debugUserFacts));
  const [saving, setSaving] = useState<"tasks" | "session" | "user" | null>(null);
  const [selectedModelInputId, setSelectedModelInputId] = useState("");

  useEffect(() => setTaskDraft(debugTasks), [debugTasks]);
  useEffect(() => setSessionMemoryDraft(toFactDraft(debugSessionFacts)), [debugSessionFacts]);
  useEffect(() => setUserMemoryDraft(toFactDraft(debugUserFacts)), [debugUserFacts]);
  useEffect(() => {
    setSelectedModelInputId((current) => (
      debugModelInputs?.some((input) => input.id === current)
        ? current
        : debugModelInputs?.at(-1)?.id ?? ""
    ));
  }, [debugModelInputs]);

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

  function updateLlmRequestConfig(value: LlmRequestConfig | undefined) {
    if (!session) return;
    onLlmRequestConfigChange(compactLlmRequestConfig(value));
  }

  let content = "";

  function renderRuntimeTools(tools: SessionRuntimeToolDebug[] | null): string {
    if (tools === null) return "Loading...";
    if (tools.length === 0) return "No currently available runtime tools.";
    return tools
      .map((tool) => {
        const params = renderToolParameters(tool.inputSchema);
        return `-- ${tool.name} [${tool.source}:${tool.capabilityId}] --\n${tool.description}\n${params}`;
      })
      .join("\n\n");
  }

  function renderRuntimeMcps(mcps: SessionRuntimeMcpDebug[] | null): string {
    if (mcps === null) return "Loading...";
    if (mcps.length === 0) return "No currently available runtime MCPs.";
    return mcps
      .map((mcp) => {
        const header = `-- ${mcp.emoji || "🔌"} ${mcp.name} (${mcp.id}) --`;
        const tools = mcp.tools.length === 0
          ? "  (no tools)"
          : mcp.tools.map((tool) => {
              const params = renderToolParameters(tool.inputSchema);
              return `  ${tool.name}\n    ${tool.description ?? ""}\n${params}`;
            }).join("\n\n");
        return `${header}\nsource=${mcp.source ?? "custom"} active=${mcp.active} running=${mcp.running}\n${mcp.instruction}\n\n${tools}`;
      })
      .join("\n\n");
  }

  function renderRuntimeSkills(skillsSnapshot: SessionRuntimeSkillDebug[] | null): string {
    if (skillsSnapshot === null) return "Loading...";
    if (skillsSnapshot.length === 0) return "No currently active runtime skills.";
    return skillsSnapshot
      .map((skill) => {
        return [
          `-- ${skill.name} (${skill.id}) --`,
          `source=${skill.source} loaded=${skill.loaded}`,
          `path=${skill.path}`,
          `resources=${skill.resources.length}`,
          skill.description,
        ].join("\n");
      })
      .join("\n\n");
  }

  function renderModelInputs(inputs: ModelInputDebug[] | null): string {
    if (inputs === null) return "Loading...";
    if (inputs.length === 0) return "No provider attempt has been prepared for the latest run.";
    const input = inputs.find((candidate) => candidate.id === selectedModelInputId) ?? inputs.at(-1)!;
    return [
      `-- ${input.purpose ?? "agent"} · step ${input.step}, attempt ${input.attempt} · ${input.endpoint} · ${input.profileId} --`,
      `createdAt=${input.createdAt}`,
      "",
      "[FINAL INSTRUCTIONS]",
      input.instructions,
      "",
      "[PROJECTED MESSAGES]",
      JSON.stringify(input.messages, null, 2),
      "",
      "[REQUEST-SCOPED ASSET CONTENT]",
      JSON.stringify(input.projectedContent, null, 2),
      "",
      "[TOOLS]",
      JSON.stringify(input.tools, null, 2),
      "",
      "[RESOLVED REQUEST CONFIG]",
      JSON.stringify(input.requestConfig, null, 2),
      "",
      "[PROFILE REQUEST BODY]",
      JSON.stringify(input.providerRequestBody, null, 2),
      "",
      "[COMPACTION OUTCOME]",
      input.outcome ? JSON.stringify(input.outcome, null, 2) : "(not a completed compaction request)",
    ].join("\n");
  }

  function renderHarnessInstructions(instructions: HarnessInstructionDebug[] | null): string {
    if (instructions === null) return "Loading...";
    return instructions.map((instruction) => [
      `-- ${instruction.id} --`,
      `source=${instruction.source}`,
      `activation=${instruction.activation}`,
      instruction.text,
    ].join("\n")).join("\n\n") || "No conditional harness instructions registered.";
  }

  if (debugTab === "model-input") {
    content = renderModelInputs(debugModelInputs);
  } else if (debugTab === "prompt") {
    content = debugPrompt ?? "Loading...";
  } else if (debugTab === "runtime") {
    content = debugRuntimeContext === null
      ? "Loading..."
      : `${debugRuntimeContext}\n\n-- Runtime diagnostics (not sent to the model) --\n${JSON.stringify(debugRuntimeDiagnostics ?? {}, null, 2)}`;
  } else if (debugTab === "harness") {
    content = renderHarnessInstructions(debugHarnessInstructions);
  } else if (debugTab === "tools") {
    content = renderRuntimeTools(debugRuntimeTools);
  } else if (debugTab === "mcps") {
    content = renderRuntimeMcps(debugRuntimeMcps);
  } else if (debugTab === "skills") {
    content = renderRuntimeSkills(debugRuntimeSkills);
  } else if (debugTab === "runs") {
    const eventIds = new Set<string>();
    const lines: string[] = [];
    for (const run of session.runs) {
      lines.push(`-- run ${run.id} --`);
      lines.push(`status=${run.status} step=${run.step} attempt=${run.attempt} toolBatch=${run.toolBatch}`);
      lines.push(`startedAt=${run.startedAt} completedAt=${run.completedAt ?? "-"}`);
      for (const event of run.events) {
        eventIds.add(event.id);
        lines.push([
          `  [${event.createdAt}] ${event.kind}`,
          `severity=${event.severity}`,
          `visibility=${event.visibility}`,
          `terminal=${event.terminal}`,
          `category=${event.errorCategory ?? "-"}`,
          `code=${event.code ?? "-"}`,
          `step=${event.step}`,
          `attempt=${event.attempt}`,
          `message=${event.message}`,
          ...(event.detail ? [`detail=${event.detail}`] : []),
        ].join("\n    "));
      }
      lines.push("");
    }
    const liveEvents = streamRunEvents.filter((event) => !eventIds.has(event.id));
    if (liveEvents.length > 0) {
      lines.push("-- live events --");
      for (const event of liveEvents) {
        lines.push([
          `[${event.createdAt}] ${event.kind}`,
          `severity=${event.severity}`,
          `visibility=${event.visibility}`,
          `terminal=${event.terminal}`,
          `category=${event.errorCategory ?? "-"}`,
          `code=${event.code ?? "-"}`,
          `step=${event.step}`,
          `attempt=${event.attempt}`,
          `message=${event.message}`,
          ...(event.detail ? [`detail=${event.detail}`] : []),
        ].join("\n  "));
      }
    }
    content = lines.join("\n") || "No runs recorded.";
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
        activeModeId: session.activeModeId,
        reasoningEffort: session.llmRequestConfig?.reasoning?.effort ?? "manufacturer default",
        reasoningHistory: session.llmRequestConfig?.reasoning?.history ?? "auto",
        temperature: session.llmRequestConfig?.sampling?.temperature ?? "profile default",
        llmRequestConfig: session.llmRequestConfig ?? null,
        providerDebug: session.providerDebug ?? null,
        contextState: session.contextState,
        messageCount: session.messages.length,
        loopModeId: loopState?.modeId ?? null,
        loopModeBehavior: loopState?.modeBehavior ?? null,
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
            return `[asset:${block.assetId}]`;
          })
          .join("\n")
          .slice(0, 300) || "(empty)";
        return `[${idx}] ${role}\n  message_id: ${m.id}\n  ${preview}${preview.length >= 300 ? "\n  [preview truncated at 300 characters]" : ""}`;
      })
      .join("\n\n");
  }

  function toggleTab(tab: ChatDebugTab) {
    onTabChange(debugTab === tab ? null : tab);
  }

  return (
    <DebugPanel>
      <DebugTabs>
        <DebugTab $active={debugTab === "model-input"} onClick={() => toggleTab("model-input")}>Model Input</DebugTab>
        <DebugTab $active={debugTab === "prompt"} onClick={() => toggleTab("prompt")}>System Prompt</DebugTab>
        <DebugTab $active={debugTab === "runtime"} onClick={() => toggleTab("runtime")}>Runtime Context</DebugTab>
        <DebugTab $active={debugTab === "harness"} onClick={() => toggleTab("harness")}>Harness</DebugTab>
        <DebugTab $active={debugTab === "tools"} onClick={() => toggleTab("tools")}>Tools</DebugTab>
        <DebugTab $active={debugTab === "mcps"} onClick={() => toggleTab("mcps")}>MCPs</DebugTab>
        <DebugTab $active={debugTab === "skills"} onClick={() => toggleTab("skills")}>Skills</DebugTab>
        <DebugTab $active={debugTab === "runs"} onClick={() => toggleTab("runs")}>Runs</DebugTab>
        <DebugTab $active={debugTab === "session"} onClick={() => toggleTab("session")}>Session</DebugTab>
        <DebugTab $active={debugTab === "messages"} onClick={() => toggleTab("messages")}>Messages</DebugTab>
        <DebugTab $active={debugTab === "tasks"} onClick={() => toggleTab("tasks")}>Tasks</DebugTab>
        <DebugTab $active={debugTab === "memory"} onClick={() => toggleTab("memory")}>Memory</DebugTab>
        <DebugControls>
          {loopState && <Badge variant="info">{`${loopState.modeId} (${loopState.modeBehavior})`}</Badge>}
          {models.length > 0 ? (
            <SelectMenu
              value={getSessionModelRef(session)}
              options={models.map((modelRef) => ({ value: modelRef, label: modelRef }))}
              onSelect={onModelSwitch}
              mono
            />
          ) : (
            <Badge variant="info">{session.model}</Badge>
          )}
          {showReasoningControl && (
            <>
              <SelectMenu
                value={resolvedEffort}
                options={reasoningOptions}
                onSelect={onReasoningSelect}
                variant="neutral"
              />
              <SelectMenu
                value={resolvedReasoningHistory}
                options={[
                  { value: "auto", label: "history: manufacturer" },
                  { value: "discard", label: "history: current turn" },
                  { value: "tool-turns", label: "history: tool turns" },
                  { value: "all", label: "history: all" },
                ]}
                onSelect={onReasoningHistorySelect}
                variant="neutral"
              />
            </>
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
            emptyHint="No internal tools found"
          />
          <CapabilitySelect
            items={debugMcps}
            activeIds={session.activeMcpIds}
            onToggle={onMcpToggle}
            kind="mcp"
            label="MCPs"
            emptyHint="No MCP servers configured"
          />
          <CapabilitySelect
            items={skills}
            activeIds={session.activeSkillIds}
            onToggle={onSkillToggle}
            kind="skill"
            label="Skills"
            emptyHint="No skills configured"
          />
        </DebugControls>
      </DebugTabs>

      {(debugTab === "prompt" || debugTab === "runtime" || debugTab === "harness" || debugTab === "tools" || debugTab === "mcps" || debugTab === "skills" || debugTab === "runs" || debugTab === "messages") && (
        <DebugContent>{content}</DebugContent>
      )}

      {debugTab === "model-input" && (
        <EditorWrap>
          {debugModelInputs && debugModelInputs.length > 0 && (
            <InputLikeSelect
              value={selectedModelInputId || debugModelInputs.at(-1)?.id}
              onChange={(event) => setSelectedModelInputId(event.target.value)}
            >
              {debugModelInputs.map((input, index) => (
                <option key={input.id} value={input.id}>
                  {`${index + 1}/${debugModelInputs.length} · ${input.purpose ?? "agent"} · step ${input.step} attempt ${input.attempt}`}
                </option>
              ))}
            </InputLikeSelect>
          )}
          <DebugContent>{content}</DebugContent>
        </EditorWrap>
      )}

      {debugTab === "session" && (
        <EditorWrap>
          <SamplingSettings
            value={session.llmRequestConfig}
            onChange={updateLlmRequestConfig}
          />
          <DebugContent>{content}</DebugContent>
        </EditorWrap>
      )}

      {debugTab === "tasks" && (
        <EditorWrap>
          {taskDraft.map((task, index) => (
            <TaskRow key={task.id}>
              <Input
                value={task.title}
                onChange={(e) => updateTask(index, { title: e.target.value })}
                placeholder="Task title"
              />
              <InputLikeSelect
                value={task.status}
                onChange={(e) => updateTask(index, { status: e.target.value as TaskItem["status"] })}
              >
                <option value="pending">pending</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
              </InputLikeSelect>
              <Input
                value={task.notes ?? ""}
                onChange={(e) => updateTask(index, { notes: e.target.value })}
                placeholder="Notes"
              />
              <Button variant="secondary" size="sm" onClick={() => removeTask(index)}>
                Remove
              </Button>
            </TaskRow>
          ))}
          <RowActions>
            <Button variant="secondary" size="sm" onClick={addTask}>Add task</Button>
            <Button size="sm" onClick={() => void saveTasks()} disabled={saving === "tasks"}>
              {saving === "tasks" ? "Saving..." : "Save tasks"}
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
              placeholder={"One fact per line\nOnly session-relevant info"}
            />
            <RowActions style={{ marginTop: "var(--space-sm)" }}>
              <Button size="sm" onClick={() => void saveSessionMemory()} disabled={saving === "session"}>
                {saving === "session" ? "Saving..." : "Save session memory"}
              </Button>
            </RowActions>
          </div>
          <div>
            <TextArea
              value={userMemoryDraft}
              onChange={(e) => setUserMemoryDraft(e.target.value)}
              placeholder={"One fact per line\nOnly long-term user info"}
            />
            <RowActions style={{ marginTop: "var(--space-sm)" }}>
              <Button size="sm" onClick={() => void saveUserMemory()} disabled={saving === "user"}>
                {saving === "user" ? "Saving..." : "Save user memory"}
              </Button>
            </RowActions>
          </div>
        </EditorWrap>
      )}
    </DebugPanel>
  );
}
