import { spawn } from "node:child_process";
import { platform } from "node:os";

function rgExists(): Promise<boolean> {
  return new Promise((resolve) => {
    const isWindows = platform() === "win32";
    const proc = spawn(isWindows ? "rg.exe" : "rg", ["--version"], { shell: false });
    let found = false;
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
    proc.stdout.on("data", () => {
      found = true;
    });
    // timeout guard
    setTimeout(() => resolve(found), 2000);
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
    "--max-count", String(options.limit + 1),
  ];
  const proc = spawn(platform() === "win32" ? "rg.exe" : "rg", args, {
    cwd: options.root,
    shell: false,
  });

  const lines: string[] = [];
  let truncated = false;

  return new Promise((resolve, reject) => {
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

    proc.on("error", (err) => reject(err));
    proc.on("exit", (code) => {
      // rg returns 1 when no matches; that's not an error for us
      if (code !== 0 && code !== 1) {
        reject(new Error(`rg exited with code ${code}`));
        return;
      }
      resolve({ paths: lines, truncated });
    });

    // 15s timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error("rg glob timed out"));
    }, 15000);
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

export interface GrepMatch {
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
    "--json",
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
  ].filter(Boolean);

  const proc = spawn(platform() === "win32" ? "rg.exe" : "rg", args, {
    cwd: options.root,
    shell: false,
  });

  const matches: GrepMatch[] = [];
  let truncated = false;
  let resultBytes = 0;
  let fileCount = 0;
  const seenFiles = new Set<string>();

  return new Promise((resolve, reject) => {
    proc.stdout.setEncoding("utf-8");
    let buffer = "";

    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === "match") {
            const file = String(obj.data?.path?.text ?? "");
            const lineNum = Number(obj.data?.line_number ?? 0);
            const linesArr = obj.data?.lines?.text ? String(obj.data.lines.text).split(/\r?\n/) : [];
            for (const text of linesArr) {
              if (matches.length >= options.headLimit + options.offset) {
                truncated = true;
                break;
              }
              const content = text.trimEnd();
              if (content.length > 500) {
                resultBytes += 500;
              } else {
                resultBytes += content.length;
              }
              if (resultBytes > options.maxResultBytes) {
                truncated = true;
                break;
              }
              matches.push({ file, line: lineNum, content });
            }
            if (file && !seenFiles.has(file)) {
              seenFiles.add(file);
              fileCount++;
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

    proc.on("error", (err) => reject(err));
    proc.on("exit", (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(`rg exited with code ${code}`));
        return;
      }
      resolve({ matches, truncated });
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error("rg grep timed out"));
    }, 15000);
  });
}
