import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getStateDirPath } from "../../../lib/state.js";

const MAX_READ_BYTES = 256 * 1024;
const MAX_MATCHES = 250;

export interface TerminalOutputCapture {
  id: string;
  directory: string;
  stdoutPath: string;
  stderrPath: string;
  stdout: WriteStream;
  stderr: WriteStream;
}

function outputRoot(sessionId: string): string {
  const sessionsRoot = resolve(getStateDirPath("sessions"));
  const root = resolve(sessionsRoot, sessionId, "terminal-output");
  const child = relative(sessionsRoot, root);
  if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error("Invalid terminal output session id.");
  return root;
}

function outputDirectory(sessionId: string, outputId: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(outputId)) throw new Error("Invalid terminal output id.");
  return join(outputRoot(sessionId), outputId);
}

export async function createTerminalOutputCapture(sessionId: string): Promise<TerminalOutputCapture> {
  const id = randomUUID();
  const directory = outputDirectory(sessionId, id);
  await mkdir(directory, { recursive: true });
  const stdoutPath = join(directory, "stdout.txt");
  const stderrPath = join(directory, "stderr.txt");
  const stdout = createWriteStream(stdoutPath, { flags: "wx" });
  const stderr = createWriteStream(stderrPath, { flags: "wx" });
  stdout.on("error", () => undefined);
  stderr.on("error", () => undefined);
  return {
    id,
    directory,
    stdoutPath,
    stderrPath,
    stdout,
    stderr,
  };
}

function waitForStream(stream: WriteStream): Promise<void> {
  if (stream.writableFinished || stream.destroyed) return Promise.resolve();
  return new Promise((resolveWait) => {
    const done = () => resolveWait();
    stream.once("finish", done);
    stream.once("close", done);
    stream.once("error", done);
  });
}

export async function finishTerminalOutputCapture(capture: TerminalOutputCapture): Promise<void> {
  if (!capture.stdout.writableEnded) capture.stdout.end();
  if (!capture.stderr.writableEnded) capture.stderr.end();
  await Promise.all([waitForStream(capture.stdout), waitForStream(capture.stderr)]);
}

export async function discardTerminalOutputCapture(capture: TerminalOutputCapture): Promise<void> {
  capture.stdout.destroy();
  capture.stderr.destroy();
  await rm(capture.directory, { recursive: true, force: true });
}

export async function disposeTerminalOutput(sessionId: string): Promise<void> {
  await rm(outputRoot(sessionId), { recursive: true, force: true });
}

export async function readTerminalOutput(input: {
  sessionId: string;
  outputId: string;
  stream: "stdout" | "stderr";
  offsetBytes?: number;
  limitBytes?: number;
  pattern?: string;
}): Promise<{ content: string; size: number; offset: number; bytesRead: number; truncated: boolean; matches?: number }> {
  const path = join(outputDirectory(input.sessionId, input.outputId), `${input.stream}.txt`);
  const info = await stat(path);
  if (input.pattern) {
    const needle = input.pattern.toLocaleLowerCase();
    if (!needle) throw new Error("pattern must not be empty.");
    const stream = createReadStream(path, { encoding: "utf8" });
    const matches: string[] = [];
    let remainder = "";
    for await (const chunk of stream) {
      const lines = `${remainder}${chunk}`.split(/\r?\n/u);
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (line.toLocaleLowerCase().includes(needle)) {
          matches.push(line.length > 4_000 ? `${line.slice(0, 4_000)}...` : line);
          if (matches.length >= MAX_MATCHES) break;
        }
      }
      if (matches.length >= MAX_MATCHES) break;
      if (remainder.length > 4_000_000) remainder = remainder.slice(-4_000_000);
    }
    if (matches.length < MAX_MATCHES && remainder.toLocaleLowerCase().includes(needle)) {
      matches.push(remainder.length > 4_000 ? `${remainder.slice(0, 4_000)}...` : remainder);
    }
    return { content: matches.join("\n"), size: info.size, offset: 0, bytesRead: Buffer.byteLength(matches.join("\n")), truncated: matches.length >= MAX_MATCHES, matches: matches.length };
  }

  const offset = Math.min(info.size, Math.max(0, Math.floor(input.offsetBytes ?? 0)));
  const limit = Math.min(MAX_READ_BYTES, Math.max(1, Math.floor(input.limitBytes ?? 64 * 1024)));
  const bytesToRead = Math.min(limit, info.size - offset);
  if (bytesToRead === 0) return { content: "", size: info.size, offset, bytesRead: 0, truncated: false };
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(path, "r");
  try {
    const result = await handle.read(buffer, 0, bytesToRead, offset);
    return {
      content: buffer.subarray(0, result.bytesRead).toString("utf8"),
      size: info.size,
      offset,
      bytesRead: result.bytesRead,
      truncated: offset + result.bytesRead < info.size,
    };
  } finally {
    await handle.close();
  }
}
