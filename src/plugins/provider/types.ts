export interface ProviderSettings {
  baseUrl: string;
  activeModel: string;
}

export interface ModelInfo {
  id: string;
  object: string;
  maxContextLength?: number;
  contextLength?: number;
}

export interface ReasoningLevelConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelSettings {
  reasoningEffort?: string;
  reasoningOnOff?: boolean;
  levels?: Record<string, ReasoningLevelConfig>;
  compactionPrompt?: string;
}
