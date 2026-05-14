import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve as resolvePath } from "node:path";

function rgExists(): Promise<boolean> {
  return new Promise((resolve) => {
    const isWindows = platform() === "win32";
    const proc = spawn(isWindows ? "rg.exe" : "rg", ["--version"], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let found = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    proc.on("error", () => finish(false));
    proc.on("exit", (code) => finish(code === 0));
    proc.stdout.on("data", () => {
      found = true;
    });
    timer = setTimeout(() => {
      proc.kill();
      finish(found);
    }, 2000);
  });
}

let cachedRgExists: boolean | undefined;

export async function isRipgrepAvailable(): Promise<boolean> {
  if (cachedRgExists !== undefined) return cachedRgExists;
  cachedRgExists = await rgExists();
  return cachedRgExists;
}

export interface GlobRipgrepOptions {
  root: string;
  pattern: string;
  limit: number;
}

export interface GlobRipgrepResult {
  paths: string[];
  truncated: boolean;
}

export async function globWithRipgrep(options: GlobRipgrepOptions): Promise<GlobRipgrepResult> {
  const args = [
    "--files",
    "--hidden",
    "--sort", "modified",
    "--glob", options.pattern,
  ];
  const proc = spawn(platform() === "win32" ? "rg.exe" : "rg", args, {
    cwd: options.root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines: string[] = [];
  let truncated = false;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    timer = setTimeout(() => {
      proc.kill();
      finish(() => reject(new Error("rg glob timed out")));
    }, 15000);

    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk: string) => {
      const parts = chunk.split(/\r?\n/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (lines.length >= options.limit) {
          truncated = true;
          continue;
        }
        lines.push(trimmed);
      }
    });

    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", () => {
      // ignore stderr noise
    });

    proc.on("error", (err) => finish(() => reject(err)));
    proc.on("exit", (code) => {
      // rg returns 1 when no matches; that's not an error for us
      if (code !== 0 && code !== 1) {
        finish(() => reject(new Error(`rg exited with code ${code}`)));
        return;
      }
      finish(() => resolve({ paths: lines, truncated }));
    });
  });
}

export interface GrepRipgrepOptions {
  root: string;
  pattern: string;
  glob?: string;
  type?: string;
  outputMode: "content" | "files_with_matches" | "count";
  headLimit: number;
  offset: number;
  caseSensitive: boolean;
  multiline: boolean;
  maxResultBytes: number;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepRipgrepResult {
  matches: GrepMatch[];
  truncated: boolean;
}

export async function grepWithRipgrep(options: GrepRipgrepOptions): Promise<GrepRipgrepResult> {
  const args: string[] = [
    options.outputMode === "files_with_matches" ? "" : "--json",
    "--hidden",
    "-n",
    options.caseSensitive ? "" : "-i",
    options.multiline ? "-U" : "",
    options.glob ? "--glob" : "",
    options.glob ?? "",
    options.type ? "-t" : "",
    options.type ?? "",
    options.outputMode === "files_with_matches" ? "-l" : "",
    options.outputMode === "count" ? "-c" : "",
    "--max-count", String(options.headLimit + options.offset + 1),
    options.pattern,
    ".",
  ].filter(Boolean);

  const proc = spawn(platform() === "win32" ? "rg.exe" : "rg", args, {
    cwd: options.root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const matches: GrepMatch[] = [];
  let truncated = false;
  let resultBytes = 0;
  const seenFiles = new Set<string>();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    timer = setTimeout(() => {
      proc.kill();
      finish(() => reject(new Error("rg grep timed out")));
    }, 15000);

    proc.stdout.setEncoding("utf-8");
    let buffer = "";

    const addFileMatch = (file: string): void => {
      const trimmed = file.trim();
      if (!trimmed || seenFiles.has(trimmed)) return;
      if (matches.length >= options.headLimit + options.offset) {
        truncated = true;
        return;
      }
      const fullPath = resolvePath(options.root, trimmed);
      seenFiles.add(trimmed);
      matches.push({ file: fullPath, line: 0, content: "" });
    };

    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk;

      if (options.outputMode === "files_with_matches") {
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          addFileMatch(line);
          if (truncated) break;
        }
        return;
      }

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === "match") {
            const file = resolvePath(options.root, String(obj.data?.path?.text ?? ""));
            const lineNum = Number(obj.data?.line_number ?? 0);
            const content = obj.data?.lines?.text ? String(obj.data.lines.text).trimEnd() : "";
            if (matches.length >= options.headLimit + options.offset) {
              truncated = true;
              break;
            }
            resultBytes += Math.min(content.length, 500);
            if (resultBytes > options.maxResultBytes) {
              truncated = true;
              break;
            }
            matches.push({ file, line: lineNum, content });
            if (file && !seenFiles.has(file)) {
              seenFiles.add(file);
            }
          } else if (obj.type === "summary") {
            // ignore
          }
        } catch {
          // ignore malformed JSON lines
        }
        if (truncated) break;
      }
    });

    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", () => {
      // ignore
    });

    proc.on("error", (err) => finish(() => reject(err)));
    proc.on("exit", (code) => {
      if (code !== 0 && code !== 1) {
        finish(() => reject(new Error(`rg exited with code ${code}`)));
        return;
      }
      if (options.outputMode === "files_with_matches" && buffer) {
        addFileMatch(buffer);
      }
      finish(() => resolve({ matches, truncated }));
    });
  });
}
