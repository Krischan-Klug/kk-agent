import type { InternalToolDefinition } from "../../types.js";
import type { ToolExecutionResult } from "../../../loop/types.js";
import { calculate } from "./engine.js";

export async function executeCalculatorTool(
  _config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult | null> {
  if (toolName !== "Calculate") return null;
  try {
    const expression = typeof args.expression === "string" ? args.expression : "";
    const precision = typeof args.precision === "number" && Number.isFinite(args.precision) ? args.precision : 32;
    const calculation = calculate(expression, precision);
    return {
      content: [
        `Expression: ${calculation.expression}`,
        `Result: ${calculation.result}`,
        `Type: ${calculation.type}`,
        `Precision: ${calculation.precision} significant digits`,
      ].join("\n"),
      metadata: { ...calculation },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: `Calculation failed: ${message}`, isError: true, metadata: { errorKind: "calculation_error" } };
  }
}
