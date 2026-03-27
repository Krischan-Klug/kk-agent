import type { McpToolDefinition } from "../../../mcp/types.js";

export const userInteractionTools: McpToolDefinition[] = [
  {
    name: "ask_user",
    description:
      "Present a multiple-choice question to the user and wait for their selection. " +
      "Use this when you need the user to decide between specific options before continuing. " +
      "Returns the selected choice key as JSON.",
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
              key: {
                type: "string",
                description: "A short unique identifier for this choice (e.g. 'a', 'option1').",
              },
              label: {
                type: "string",
                description: "The display text for this choice.",
              },
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
