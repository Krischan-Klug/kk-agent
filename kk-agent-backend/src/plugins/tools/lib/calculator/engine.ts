import {
  all,
  create,
  type ArrayNode,
  type ConstantNode,
  type FunctionNode,
  type MathNode,
  type OperatorNode,
  type SymbolNode,
} from "mathjs";

const MAX_EXPRESSION_CHARS = 4_096;
const MAX_AST_NODES = 512;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_POWER = 10_000;
const MAX_RESULT_CHARS = 64_000;

const FUNCTION_ALIASES: Readonly<Record<string, string>> = {
  comb: "combinations",
  ln: "log",
  stdev: "std",
  var: "variance",
};

const ALLOWED_NODE_TYPES = new Set([
  "ArrayNode",
  "ConstantNode",
  "FunctionNode",
  "OperatorNode",
  "ParenthesisNode",
  "SymbolNode",
]);

const ALLOWED_FUNCTIONS = new Set([
  "abs", "acos", "acosh", "acot", "acoth", "acsc", "acsch", "add", "arg", "asec", "asech",
  "asin", "asinh", "atan", "atan2", "atanh", "bignumber", "cbrt", "ceil", "combinations",
  "combinationsWithRep", "complex", "conj", "cos", "cosh", "cot", "coth", "count", "cross", "csc",
  "csch", "cube", "det", "distance", "divide", "dot", "dotDivide", "dotMultiply", "dotPow", "eigs",
  "equal", "exp", "expm1", "factorial", "fix", "floor", "fraction", "gamma", "gcd", "hypot", "im",
  "inv", "larger", "largerEq", "lcm", "log", "log10", "log1p", "log2", "mad", "max", "mean",
  "median", "min", "mod", "mode", "multiply", "norm", "nthRoot", "number", "permutations",
  "pow", "prod", "quantileSeq", "re", "round", "sec", "sech", "sign", "sin", "sinh", "sqrt",
  "square", "std", "subtract", "sum", "tan", "tanh", "trace", "transpose", "unequal", "variance",
]);

const DISABLED_FUNCTIONS = [
  "createUnit",
  "derivative",
  "evaluate",
  "import",
  "parse",
  "resolve",
  "reviver",
  "simplify",
] as const;

const math = create(all, {
  matrix: "Array",
  number: "BigNumber",
  precision: 64,
  relTol: 1e-60,
  absTol: 1e-63,
  predictable: false,
});

const parseExpression = math.parse.bind(math);
const disabledImplementations = Object.fromEntries(DISABLED_FUNCTIONS.map((name) => [
  name,
  () => { throw new Error(`${name} is disabled.`); },
]));
math.import(disabledImplementations, { override: true });

function numericConstant(node: MathNode | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === "ConstantNode") {
    const value = (node as ConstantNode).value;
    const numeric = Number(String(value));
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (node.type !== "OperatorNode") return undefined;
  const operator = node as OperatorNode;
  const left = numericConstant(operator.args[0]);
  if (left === undefined) return undefined;
  if (operator.op === "+" && operator.args.length === 1) return left;
  if (operator.op === "-" && operator.args.length === 1) return -left;
  const right = numericConstant(operator.args[1]);
  if (right === undefined) return undefined;
  if (operator.op === "+") return left + right;
  if (operator.op === "-") return left - right;
  if (operator.op === "*") return left * right;
  if (operator.op === "/" && right !== 0) return left / right;
  return undefined;
}

function validateExpressionTree(root: MathNode): void {
  let nodeCount = 0;
  let arrayItems = 0;

  root.traverse((node) => {
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) throw new Error(`Expression exceeds the ${MAX_AST_NODES}-node complexity limit.`);
    if (!ALLOWED_NODE_TYPES.has(node.type)) throw new Error(`${node.type} is not allowed in calculator expressions.`);

    if (node.type === "ConstantNode" && typeof (node as ConstantNode).value === "string") {
      throw new Error("String values are not allowed in calculator expressions.");
    }

    if (node.type === "SymbolNode") {
      const name = (node as SymbolNode).name;
      if (name.startsWith("_") || DISABLED_FUNCTIONS.includes(name as typeof DISABLED_FUNCTIONS[number])) {
        throw new Error(`Symbol "${name}" is not allowed.`);
      }
    }

    if (node.type === "FunctionNode") {
      const fn = (node as FunctionNode).fn;
      if (!fn || typeof fn !== "object" || (fn as MathNode).type !== "SymbolNode") {
        throw new Error("Only direct calculator function calls are allowed.");
      }
      const name = (fn as SymbolNode).name;
      if (!ALLOWED_FUNCTIONS.has(name)) throw new Error(`Function "${name}" is not available in the calculator.`);
      if (["combinations", "combinationsWithRep", "factorial", "gamma", "permutations", "pow"].includes(name)) {
        for (const argument of (node as FunctionNode).args) {
          const numeric = numericConstant(argument);
          if (numeric === undefined) throw new Error(`${name} requires literal numeric arguments.`);
          if (Math.abs(numeric) > MAX_POWER) throw new Error(`${name} input exceeds the safe limit of ${MAX_POWER}.`);
        }
      }
    }

    if (node.type === "OperatorNode") {
      const operator = node as OperatorNode;
      if (operator.op === "^" || operator.op === ".^") {
        const exponent = numericConstant(operator.args[1]);
        if (exponent === undefined) throw new Error("Exponents must be literal numbers.");
        if (Math.abs(exponent) > MAX_POWER) throw new Error(`Exponent exceeds the safe limit of ${MAX_POWER}.`);
      }
      if (operator.op === "!" && Math.abs(numericConstant(operator.args[0]) ?? (MAX_POWER + 1)) > MAX_POWER) {
        throw new Error(`Factorial input exceeds the safe limit of ${MAX_POWER}.`);
      }
    }

    if (node.type === "ArrayNode") {
      arrayItems += (node as ArrayNode).items.length;
      if (arrayItems > MAX_ARRAY_ITEMS) throw new Error(`Array input exceeds the ${MAX_ARRAY_ITEMS}-item limit.`);
    }
  });
}

function normalizeExpression(expression: string): string {
  let normalized = expression.replaceAll("**", "^");
  for (const [alias, canonical] of Object.entries(FUNCTION_ALIASES)) {
    normalized = normalized.replace(new RegExp(`\\b${alias}\\s*(?=\\()`, "gu"), canonical);
  }
  const temperature = normalized.match(/^(.+?)\s*°?([FC])\s+to\s+°?([FC])$/iu);
  if (temperature) {
    normalized = `${temperature[1]} deg${temperature[2]!.toUpperCase()} to deg${temperature[3]!.toUpperCase()}`;
  }
  return normalized;
}

export interface CalculationResult {
  expression: string;
  result: string;
  type: string;
  precision: number;
}

export function calculate(expressionInput: string, precisionInput = 32): CalculationResult {
  const expression = expressionInput.trim();
  if (!expression) throw new Error("Calculate requires a non-empty expression.");
  if (expression.length > MAX_EXPRESSION_CHARS) throw new Error(`Expression exceeds ${MAX_EXPRESSION_CHARS} characters.`);
  const precision = Number.isFinite(precisionInput)
    ? Math.min(64, Math.max(1, Math.floor(precisionInput)))
    : 32;
  const tree = parseExpression(normalizeExpression(expression));
  validateExpressionTree(tree);
  const value = tree.compile().evaluate(new Map());
  const result = math.format(value, { notation: "auto", precision, lowerExp: -12, upperExp: 64 });
  if (result.length > MAX_RESULT_CHARS) throw new Error(`Formatted result exceeds ${MAX_RESULT_CHARS} characters.`);
  return { expression, result, type: math.typeOf(value), precision };
}
