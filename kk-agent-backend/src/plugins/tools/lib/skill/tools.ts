import type { InternalToolDescriptor } from "../../types.js";

export const skillTools: InternalToolDescriptor[] = [
  {
    name: "Skill",
    description: "Load one listed Agent Skill.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact skill name from <available_skills>.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    capabilityId: "skill",
  },
];
