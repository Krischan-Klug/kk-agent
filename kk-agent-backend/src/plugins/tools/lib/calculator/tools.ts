import type { InternalToolDescriptor } from "../../types.js";

export const calculatorTools: InternalToolDescriptor[] = [
  {
    name: "Calculate",
    description:
      "Evaluate one deterministic mathematical expression with high precision. Supports arithmetic, percentages, powers, roots, logarithms, trigonometry, statistics, combinatorics, units, matrices, and complex numbers. Examples: '15% * 240', 'mean([2, 4, 8])', '12.7 cm to inch', 'det([[1,2],[3,4]])'.",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A calculator-style math expression. Use ^ for powers and explicit arrays for datasets or matrices.",
          minLength: 1,
          maxLength: 4_096,
        },
        precision: {
          type: "integer",
          description: "Significant digits to display, from 1 to 64. Defaults to 32.",
          minimum: 1,
          maximum: 64,
          default: 32,
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
];
