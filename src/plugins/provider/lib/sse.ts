/**
 * Generic SSE (Server-Sent Events) stream reader.
 * Reads a fetch Response body line-by-line, parses `data: {...}` lines,
 * and calls onEvent for each parsed JSON object.
 *
 * @param res    - fetch Response with a readable body
 * @param onEvent - callback per parsed event; return `true` to stop reading
 */
export async function readSSEStream(
  res: Response,
  onEvent: (parsed: Record<string, unknown>) => boolean,
  options: { throwOnProviderError?: boolean } = {},
): Promise<void> {
  if (!res.body) throw new Error("No response body for streaming");
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      // Surface provider-level errors
      const errorPayload = parsed.error;
      if (errorPayload && typeof errorPayload === "object") {
        const message =
          "message" in errorPayload && typeof errorPayload.message === "string"
            ? errorPayload.message
            : JSON.stringify(errorPayload);
        if (options.throwOnProviderError !== false) {
          throw new Error(`Provider stream error: ${message}`);
        }
      }

      if (parsed.type === "error" && typeof parsed.message === "string") {
        if (options.throwOnProviderError !== false) {
          throw new Error(`Provider stream error: ${parsed.message}`);
        }
      }

      if (onEvent(parsed)) return;
    }
  }
}
