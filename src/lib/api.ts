import type {
  SessionState,
  CreateSessionBody,
  McpListItem,
  McpServerConfig,
  ModelInfo,
  StreamEvent,
  CreateMcpBody,
  UpdateMcpBody,
  AgentDefinition,
  AgentLoopState,
  CreateAgentBody,
  UpdateAgentBody,
  ModelSettings,
  AppDefaults,
  ProviderConfig,
  CreateProviderBody,
  UpdateProviderBody,
  SystemVariablesResponse,
  UpdateSessionBody,
  TaskItem,
  MemoryFact,
  AttachmentMeta,
  SkillDefinition,
  SessionPromptDebug,
  CreateSkillBody,
  UpdateSkillBody,
} from "@/types/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getSessionAttachmentUrl(sessionId: string, attachmentId: string): string {
  return `${BASE}/session/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const provider = {
  /* Model endpoints */
  getModels: (providerId?: string) =>
    request<{ models: ModelInfo[]; activeProviderId: string; modelSettings: Record<string, ModelSettings> }>(
      `/provider/models${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ""}`,
    ),

  setModelSettings: (providerId: string, modelId: string, settings: ModelSettings) =>
    request<{ modelId: string; settings: ModelSettings }>(
      `/provider/models/${encodeURIComponent(modelId)}/settings`,
      { method: "PUT", body: JSON.stringify({ providerId, settings }) },
    ),

  /* Provider CRUD */
  listProviders: () =>
    request<ProviderConfig[]>("/provider/providers"),

  addProvider: (body: CreateProviderBody) =>
    request<ProviderConfig>("/provider/providers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateProvider: (id: string, body: UpdateProviderBody) =>
    request<ProviderConfig>(`/provider/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  removeProvider: (id: string) =>
    request<{ deleted: boolean }>(`/provider/providers/${id}`, { method: "DELETE" }),

  activateProvider: (id: string) =>
    request<{ activeProviderId: string }>(`/provider/providers/${id}/activate`, { method: "POST" }),

  testProvider: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/provider/providers/${id}/test`, { method: "POST" }),
};

export const mcp = {
  list: () => request<McpListItem[]>("/mcp"),

  toggle: (id: string, active: boolean) =>
    request<McpServerConfig>(`/mcp/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ active }),
    }),

  setInstruction: (id: string, instruction: string) =>
    request<McpServerConfig>(`/mcp/${id}/instruction`, {
      method: "PUT",
      body: JSON.stringify({ instruction }),
    }),

  start: (id: string) =>
    request<{ status: string }>(`/mcp/${id}/start`, { method: "POST" }),

  stop: (id: string) =>
    request<{ status: string }>(`/mcp/${id}/stop`, { method: "POST" }),

  create: (body: CreateMcpBody) =>
    request<McpServerConfig>("/mcp", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/mcp/${id}`, { method: "DELETE" }),

  update: (id: string, body: UpdateMcpBody) =>
    request<McpServerConfig>(`/mcp/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

export const tools = {
  list: () => request<McpListItem[]>("/tools"),

  toggle: (id: string, active: boolean) =>
    request<McpServerConfig>(`/tools/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ active }),
    }),

  setInstruction: (id: string, instruction: string) =>
    request<McpServerConfig>(`/tools/${id}/instruction`, {
      method: "PUT",
      body: JSON.stringify({ instruction }),
    }),

  start: (id: string) =>
    request<{ status: string }>(`/tools/${id}/start`, { method: "POST" }),

  stop: (id: string) =>
    request<{ status: string }>(`/tools/${id}/stop`, { method: "POST" }),

  update: (id: string, body: UpdateMcpBody) =>
    request<McpServerConfig>(`/tools/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  listTasks: (sessionId: string) =>
    request<{ tasks: TaskItem[] }>(`/tools/task/session/${sessionId}`),

  replaceTasks: (sessionId: string, tasks: TaskItem[]) =>
    request<{ tasks: TaskItem[] }>(`/tools/task/session/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ tasks }),
    }),

  listUserMemory: () =>
    request<{ facts: MemoryFact[] }>("/tools/memory/user"),

  replaceUserMemory: (facts: MemoryFact[]) =>
    request<{ facts: MemoryFact[] }>("/tools/memory/user", {
      method: "PUT",
      body: JSON.stringify({ facts }),
    }),

  listSessionMemory: (sessionId: string) =>
    request<{ facts: MemoryFact[] }>(`/tools/memory/session/${sessionId}`),

  replaceSessionMemory: (sessionId: string, facts: MemoryFact[]) =>
    request<{ facts: MemoryFact[] }>(`/tools/memory/session/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ facts }),
    }),
};

export const agent = {
  list: () => request<AgentDefinition[]>("/agent"),

  systemVariables: () => request<SystemVariablesResponse>("/agent/system-variables"),

  create: (body: CreateAgentBody) =>
    request<AgentDefinition>("/agent", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: UpdateAgentBody) =>
    request<AgentDefinition>(`/agent/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/agent/${id}`, { method: "DELETE" }),

  loopState: (sessionId: string) =>
    request<AgentLoopState>(`/agent/loop-state/${sessionId}`),

  loopStateStream: (
    sessionId: string,
    onEvent: (state: AgentLoopState) => void,
  ): (() => void) => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${BASE}/agent/loop-state/${sessionId}/stream`, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const state = JSON.parse(trimmed.slice(6)) as AgentLoopState;
              onEvent(state);
            } catch {
              // skip
            }
          }
        }
      } catch {
        // aborted or network error
      }
    })();

    return () => controller.abort();
  },
};

export const skills = {
  list: () => request<SkillDefinition[]>("/skills"),

  create: (body: CreateSkillBody) =>
    request<SkillDefinition>("/skills", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: UpdateSkillBody) =>
    request<SkillDefinition>(`/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/skills/${id}`, { method: "DELETE" }),
};

export const settings = {
  getDefaults: () => request<AppDefaults>("/settings/defaults"),

  updateDefaults: (body: Partial<AppDefaults>) =>
    request<AppDefaults>("/settings/defaults", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

export const session = {
  create: (body: CreateSessionBody) =>
    request<SessionState>("/session", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  list: () => request<SessionState[]>("/session"),

  get: (id: string) => request<SessionState>(`/session/${id}`),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/session/${id}`, { method: "DELETE" }),

  update: (id: string, body: UpdateSessionBody) =>
    request<SessionState>(`/session/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  chat: (id: string, message: string) =>
    request<{ response: string; session: SessionState }>(
      `/session/${id}/chat`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
    ),

  getPrompt: (id: string) =>
    request<SessionPromptDebug>(`/session/${id}/prompt`),

  respondToPrompt: (sessionId: string, promptId: string, selectedKey: string) =>
    request<{ ok: boolean }>(`/session/${sessionId}/prompt/respond`, {
      method: "POST",
      body: JSON.stringify({ promptId, selectedKey }),
    }),

  uploadAttachment: async (sessionId: string, file: File): Promise<AttachmentMeta> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/session/${sessionId}/attachments`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json() as Promise<AttachmentMeta>;
  },

  chatStream: async (
    id: string,
    message: string,
    onEvent: (event: StreamEvent) => void,
    attachmentIds?: string[],
  ): Promise<void> => {
    const res = await fetch(`${BASE}/session/${id}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, attachmentIds }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
          onEvent(event);
        } catch {
          // skip malformed lines
        }
      }
    }
  },

  abort: async (id: string): Promise<{ ok: boolean }> => {
    const res = await fetch(`${BASE}/session/${id}/abort`, { method: "POST" });
    if (!res.ok) {
      if (res.status === 404) return { ok: false };
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return { ok: true };
  },
};
