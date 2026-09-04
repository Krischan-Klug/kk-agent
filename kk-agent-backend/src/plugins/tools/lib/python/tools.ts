import type { InternalToolDescriptor } from "../../types.js";
import { PYTHON_DEFAULT_TIMEOUT_SECONDS, PYTHON_MAX_TIMEOUT_SECONDS } from "./config.js";

export const pythonTools: InternalToolDescriptor[] = [
  {
    name: "Python",
    description:
      "Run Python in an isolated session-scoped WebAssembly runtime for algorithms, simulations, data analysis, code checks, plots, conversions, and artifact generation. Normal Python language features and standard-library imports are available; compatible Pyodide packages are loaded from its package catalog. Variables and /workspace files persist across calls in the same session. End with an expression to return its repr. Input assets are mapped by INPUT_FILES; /input and /output reset per call, and valid non-empty files under /output are returned as artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Python source code. Print useful intermediate output and optionally end with an expression whose repr should be returned.",
          minLength: 1,
          maxLength: 20_000,
        },
        input_asset_ids: {
          type: "array",
          description: "Optional asset IDs from the current session. In code, use INPUT_FILES[assetId] for each exact read-only path; never construct or guess /input paths.",
          items: { type: "string" },
          maxItems: 8,
          uniqueItems: true,
        },
        timeout_seconds: {
          type: "integer",
          description: `Execution limit from 1 to ${PYTHON_MAX_TIMEOUT_SECONDS} seconds. Defaults to ${PYTHON_DEFAULT_TIMEOUT_SECONDS} seconds.`,
          minimum: 1,
          maximum: PYTHON_MAX_TIMEOUT_SECONDS,
          default: PYTHON_DEFAULT_TIMEOUT_SECONDS,
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
];
