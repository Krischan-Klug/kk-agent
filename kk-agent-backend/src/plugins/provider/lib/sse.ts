import { ProviderError } from "./errors.js";

const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;

function providerStreamError(parsed: Record<string, unknown>): ProviderError | undefined {
  const error = parsed.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    return new ProviderError(
      typeof record.message === "string" ? `Provider stream error: ${record.message}` : "Provider stream error.",
      {
        code: typeof record.code === "string" ? record.code : undefined,
        providerType: typeof record.type === "string" ? record.type : undefined,
        param: typeof record.param === "string" ? record.param : undefined,
      },
    );
  }
  if (parsed.type === "error" && typeof parsed.message === "string") {
    return new ProviderError(`Provider stream error: ${parsed.message}`);
  }
  return undefined;
}

function parseEventBlock(block: string): string | undefined {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return data.length > 0 ? data.join("\n") : undefined;
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new ProviderError(`Provider stream timed out after ${idleTimeoutMs}ms of inactivity.`)),
      idleTimeoutMs,
    );
    const onAbort = () => reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

export async function readSSEStream(
  response: Response,
  onEvent: (parsed: Record<string, unknown>) => boolean,
  options: {
    signal?: AbortSignal;
    idleTimeoutMs?: number;
  } = {},
): Promise<void> {
  if (!response.body) throw new ProviderError("Provider returned no streaming response body.");
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (contentType && !contentType.includes("text/event-stream")) {
    throw new ProviderError(`Expected text/event-stream but provider returned ${contentType}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const dispatch = (block: string): boolean => {
    const payload = parseEventBlock(block);
    if (payload === undefined || payload.length === 0) return false;
    if (payload === "[DONE]") {
      completed = true;
      return true;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      throw new ProviderError("Provider sent malformed JSON in its SSE stream.", { cause: error });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ProviderError("Provider sent a non-object SSE payload.");
    }
    const record = parsed as Record<string, unknown>;
    const streamError = providerStreamError(record);
    if (streamError) throw streamError;
    return onEvent(record);
  };

  try {
    while (!completed) {
      const { done, value } = await readWithIdleTimeout(
        reader,
        options.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
        options.signal,
      );
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (dispatch(block)) {
          completed = true;
          break;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (!completed && buffer.trim() && dispatch(buffer)) completed = true;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
