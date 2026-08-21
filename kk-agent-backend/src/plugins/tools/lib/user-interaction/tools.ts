import type { McpToolDefinition } from "../../../mcp/types.js";

export const userInteractionTools: McpToolDefinition[] = [
  {
    name: "ask_user",
    description: "Present one multiple-choice question and return the selected key.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to present to the user.",
        },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Unique choice identifier." },
              label: { type: "string", description: "Display text for this choice." },
            },
            required: ["key", "label"],
          },
          minItems: 2,
          maxItems: 10,
          description: "The choices to present. Between 2 and 10 options.",
        },
      },
      required: ["question", "choices"],
    },
    mcpId: "user-interaction",
  },
];
