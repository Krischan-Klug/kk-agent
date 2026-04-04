import { createTranscriptMessage, getMessageText, getToolUses, textBlock, toolResultBlock } from "../src/plugins/lib/transcript.js";
import { chatStream as chatCompletionsStream } from "../src/plugins/provider/lib/endpoints/chat-completions.js";
import { chatStream as responsesStream } from "../src/plugins/provider/lib/endpoints/responses.js";
import type { EndpointTransportProfile } from "../src/plugins/provider/types.js";
import type { UnifiedRequest, UnifiedResponse, UnifiedToolDefinition } from "../src/plugins/provider/lib/types.js";

const baseUrl = "http://127.0.0.1:1234";
const model = process.argv[2] ?? "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2";

const tools: UnifiedToolDefinition[] = [
  {
    name: "Glob",
    description: "Fast file pattern matching for finding files by name.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern." },
        path: { type: "string", description: "Base path." },
      },
      required: ["pattern"],
    },
  },
];

const responsesProfile: EndpointTransportProfile = {
  supported: true,
  reasoningTransport: "responses-effort",
  toolSchemaTransport: "responses-tools",
  streamGrammar: "openai-responses",
  toolCallAssemblyMode: "responses-output-state",
  supportsParallelToolCalls: true,
  supportsConcatenatedJsonSplit: true,
  continuationMode: "raw-output-replay",
  supportsStrictTools: false,
};

const chatCompletionsProfile: EndpointTransportProfile = {
  supported: true,
  reasoningTransport: "chat-completions-effort",
  toolSchemaTransport: "chat-completions-tools",
  streamGrammar: "openai-chat-completions",
  toolCallAssemblyMode: "chat-completions-indexed",
  supportsParallelToolCalls: true,
  supportsConcatenatedJsonSplit: true,
  continuationMode: "none",
  supportsStrictTools: true,
};

function buildInitialMessages() {
  return [
    createTranscriptMessage({
      role: "system",
      content: [textBlock("Du bist ein Agent. Nutze Tools strukturiert und erfinde keine Tool-Ergebnisse.")],
    }),
    createTranscriptMessage({
      role: "user",
      content: [textBlock("Analysiere C:\\Users\\KriKra\\dev\\ai\\kk-agent. Nutze zuerst Glob und gib danach kurz an, was du gefunden hast.")],
    }),
  ];
}

function summarize(label: string, response: UnifiedResponse) {
  return {
    label,
    finishReason: response.finishReason,
    textPreview: getMessageText(response.message).slice(0, 240),
    toolUses: getToolUses(response.message).map((toolUse) => ({
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    })),
    notices: response.notices ?? [],
    parseIssues: response.parseIssues ?? [],
    debug: response.debug,
  };
}

async function runCase(
  endpoint: "chat-completions" | "responses",
  transportProfile: EndpointTransportProfile,
  runner: (request: UnifiedRequest, baseUrl: string, onChunk: () => void) => Promise<UnifiedResponse>,
) {
  const initialMessages = buildInitialMessages();
  const first = await runner({
    model,
    endpoint,
    messages: initialMessages,
    tools,
    reasoningEffort: "medium",
    temperature: 1,
    maxOutputTokens: 2048,
    transportProfile,
  }, baseUrl, () => undefined);

  const toolUse = getToolUses(first.message)[0];
  let second: UnifiedResponse | undefined;

  if (toolUse) {
    second = await runner({
      model,
      endpoint,
      messages: [
        ...initialMessages,
        first.message,
        createTranscriptMessage({
          role: "tool",
          content: [toolResultBlock(toolUse.id, "C:\\Users\\KriKra\\dev\\ai\\kk-agent\\AGENTS.md\nC:\\Users\\KriKra\\dev\\ai\\kk-agent\\README.md\nC:\\Users\\KriKra\\dev\\ai\\kk-agent\\kk-agent-backend\\package.json")],
        }),
      ],
      tools,
      reasoningEffort: "medium",
      temperature: 1,
      maxOutputTokens: 2048,
      transportProfile,
      transportState: first.transportState,
    }, baseUrl, () => undefined);
  }

  return {
    first: summarize(`${endpoint}:first`, first),
    second: second ? summarize(`${endpoint}:second`, second) : null,
  };
}

const summary = {
  model,
  responses: await runCase("responses", responsesProfile, responsesStream),
  chatCompletions: await runCase("chat-completions", chatCompletionsProfile, chatCompletionsStream),
};

console.log(JSON.stringify(summary, null, 2));
