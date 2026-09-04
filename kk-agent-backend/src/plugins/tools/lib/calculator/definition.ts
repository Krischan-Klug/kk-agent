import { defineInternalTool } from "../internal-tool-definition.js";

export const calculatorDefinition = defineInternalTool({
  id: "calculator",
  name: "Calculator",
  instruction:
    "Use Calculate for every derived numeric result that can be expressed directly, including arithmetic, percentages, statistics, units, matrices, and complex numbers. " +
    "Pass an explicit expression and use the returned value instead of mental arithmetic. Common Python-style powers (**), ln, var, stdev, comb, and F/C temperature conversions are supported. " +
    "Prefer this tool over Python when one expression is sufficient.",
  emoji: "🧮",
});
