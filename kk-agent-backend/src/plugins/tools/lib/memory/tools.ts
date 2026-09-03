import type { InternalToolDescriptor } from "../../types.js";

export const memoryTools: InternalToolDescriptor[] = [
  {
    name: "remember_facts",
    description: "Store short session facts or durable user preferences that are likely to matter again later.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["session", "user"] },
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
            },
            required: ["text"],
          },
        },
      },
      required: ["scope", "facts"],
    },
  },
];
