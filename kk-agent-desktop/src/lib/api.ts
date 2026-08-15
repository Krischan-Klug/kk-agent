import type {
  SessionState,
  CreateSessionBody,
  McpListItem,
  McpServerConfig,
  ModelInfo,
  ModelProfileSummary,
  StreamEvent,
  CreateMcpBody,
  UpdateMcpBody,
  AgentDefinition,
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
  AssetMeta,
  SkillDefinition,
  SessionPromptDebug,
  ImportSkillResult,
} from "@/types/api";

function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const desktopBase = window.kkAgentDesktop?.apiBaseUrl?.trim();
    if (desktopBase) return desktopBase;
  }

  const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBase) return envBase;

  return "http://127.0.0.1:3001";
}

const BASE = resolveApiBaseUrl();

function resolveApiToken(): string | undefined {
  if (typeof window !== "undefined") {
    const desktopToken = window.kkAgentDesktop?.apiToken?.trim();
    if (desktopToken) return desktopToken;
  }

  const envToken = process.env.NEXT_PUBLIC_KK_AGENT_API_TOKEN?.trim();
  return envToken || undefined;
}

const API_TOKEN = resolveApiToken();

function authHeaders(headers?: HeadersInit): HeadersInit {
  return {
    ...(API_TOKEN ? { "X-KK-Agent-Token": API_TOKEN } : {}),
    ...headers,
  };
}

async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders({ "Content-Type": "application/json", ...init?.headers }),
    ...init,
  });
  await assertOk(res);
  return res.json() as Promise<T>;
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  await assertOk(res);
  return res.json() as Promise<T>;
}

async function readSseJsonStream<T>(
  res: Response,
  onEvent: (event: T) => void | Promise<void>,
): Promise<void> {
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
      const event = JSON.parse(trimmed.slice(6)) as T;
      await onEvent(event);
    }
  }
}

export const provider = {
  /* Model endpoints */
  getModels: (providerId?: string) =>
    request<{
      models: ModelInfo[];
      profiles: ModelProfileSummary[];
      providerId?: string;
      modelSettings: Record<string, ModelSettings>;
    }>(
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

  testProvider: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/provider/providers/${id}/test`, { method: "POST" }),
};

function capabilityApi(basePath: "/mcp" | "/tools") {
  return {
    list: () => request<McpListItem[]>(basePath),

    update: (id: string, body: UpdateMcpBody) =>
      request<McpServerConfig>(`${basePath}/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  };
}

export const mcp = {
  ...capabilityApi("/mcp"),

  create: (body: CreateMcpBody) =>
    request<McpServerConfig>("/mcp", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/mcp/${id}`, { method: "DELETE" }),
};

export const tools = {
  ...capabilityApi("/tools"),

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

};

export const skills = {
  list: () => request<SkillDefinition[]>("/skills"),

  importBundle: (files: Array<{ file: File; path: string }>): Promise<ImportSkillResult> => {
    const form = new FormData();
    for (const entry of files) {
      form.append("files", entry.file, entry.file.name);
      form.append("paths", entry.path);
    }
    return requestForm("/skills/import", form);
  },

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

  getPrompt: (id: string) =>
    request<SessionPromptDebug>(`/session/${id}/prompt`),

  respondToPrompt: (sessionId: string, promptId: string, selectedKey: string) =>
    request<{ ok: boolean }>(`/session/${sessionId}/prompt/respond`, {
      method: "POST",
      body: JSON.stringify({ promptId, selectedKey }),
    }),

  uploadAsset: (sessionId: string, file: File): Promise<AssetMeta> => {
    const form = new FormData();
    form.append("file", file);
    return requestForm(`/session/${sessionId}/assets`, form);
  },

  deleteAsset: (sessionId: string, assetId: string) =>
    request<{ deleted: boolean }>(`/session/${sessionId}/assets/${assetId}`, { method: "DELETE" }),

  getAssetBlob: async (sessionId: string, assetId: string, previewPage?: number): Promise<Blob> => {
    const suffix = previewPage ? `/preview/${previewPage}` : "";
    const res = await fetch(`${BASE}/session/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}${suffix}`, {
      headers: authHeaders(),
    });
    await assertOk(res);
    return res.blob();
  },

  chatStream: async (
    id: string,
    message: string,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    assetIds?: string[],
  ): Promise<void> => {
    const res = await fetch(`${BASE}/session/${id}/chat/stream`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, assetIds }),
    });

    await assertOk(res);
    await readSseJsonStream(res, onEvent);
  },

  abort: async (id: string): Promise<{ ok: boolean }> => {
    const res = await fetch(`${BASE}/session/${id}/abort`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 404) return { ok: false };
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return { ok: true };
  },
};
