const READ_ONLY_COMMAND_PREFIXES = [
  "pwd",
  "ls",
  "dir",
  "tree",
  "find",
  "type",
  "cat",
  "head",
  "tail",
  "more",
  "rg",
  "grep",
  "findstr",
  "where",
  "where.exe",
  "git status",
  "git diff",
  "git show",
  "git log",
  "git branch",
  "git rev-parse",
  "git ls-files",
  "git grep",
  "get-childitem",
  "get-content",
  "select-string",
  "test-path",
  "get-item",
  "resolve-path",
  "node --version",
  "npm -v",
  "pnpm -v",
  "yarn -v",
  "python --version",
  "python -V",
];

const SEMANTIC_NEUTRAL_COMMAND_PREFIXES = [
  "echo",
  "printf",
  "true",
  "false",
  ":",
];

const READ_ONLY_BLOCK_PATTERNS = [
  /\b(remove-item|set-content|add-content|out-file|copy-item|move-item|rename-item|new-item|clear-content|set-item)\b/,
  /\b(rm|del|erase|copy|cp|move|mv|ren|mkdir|rmdir|touch|chmod|chown|sed|awk|perl)\b/,
  /\bgit\s+(add|apply|commit|merge|rebase|push|pull|checkout|switch|restore|reset|clean|stash|tag|cherry-pick)\b/,
  /\bnpm\s+(install|update|uninstall|run|exec|ci)\b/,
  /\bpnpm\s+(add|install|update|remove|run|exec)\b/,
  /\byarn\s+(add|install|remove|up|run|dlx)\b/,
  /\b(python\s+-m\s+pip|pip\s+(install|uninstall)|uv\s+(pip|sync|run))\b/,
];

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/,
  /\bdel\b/,
  /\berase\b/,
  /\brmdir\b/,
  /\brd\b/,
  /\bformat\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bgit\s+(reset|clean|checkout|restore|push|rebase|pull)\b/,
];

export function normalizeShellCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function stripSafeStderrRedirection(command: string): string {
  return command
    .replace(/\s2>>?\s*nul\b/gi, "")
    .replace(/\s2>>?\s*\$null\b/gi, "")
    .replace(/\s2>>?\s*\/dev\/null\b/gi, "");
}

function splitCommandSegments(command: string): string[] {
  return command
    .split(/\s*(?:\|\||&&|\||;)\s*/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function containsUnsupportedRedirection(command: string): boolean {
  return /(^|[^\d])>>?|<</.test(command) || /\s[01]>>?/.test(command) || /\s<\s*/.test(command);
}

function isReadOnlyCommandSegment(segment: string): boolean {
  const normalized = normalizeShellCommand(stripSafeStderrRedirection(segment));
  const lower = normalized.toLowerCase();
  if (!lower) return false;
  if (containsUnsupportedRedirection(lower)) return false;
  if (READ_ONLY_BLOCK_PATTERNS.some((pattern) => pattern.test(lower))) return false;
  if (SEMANTIC_NEUTRAL_COMMAND_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `))) {
    return true;
  }
  return READ_ONLY_COMMAND_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `));
}

export function isReadOnlyShellCommand(command: string): boolean {
  const normalized = normalizeShellCommand(command);
  const lower = normalized.toLowerCase();
  if (!lower) return false;
  const segments = splitCommandSegments(lower);
  if (segments.length === 0) return false;
  return segments.every((segment) => isReadOnlyCommandSegment(segment));
}

export function isDestructiveShellCommand(command: string): boolean {
  const normalized = normalizeShellCommand(command).toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getShellPermissionPrompt(command: string): {
  question: string;
  choices: { key: string; label: string }[];
  allowKeys: string[];
  deniedMessage: string;
} {
  return {
    question: `Der Befehl aendert wahrscheinlich den lokalen Zustand. Wirklich ausfuehren?\n\n${command}`,
    choices: [
      { key: "allow_once", label: "Einmal erlauben" },
      { key: "deny", label: "Abbrechen" },
    ],
    allowKeys: ["allow_once"],
    deniedMessage: "The shell command was rejected by the user.",
  };
}
