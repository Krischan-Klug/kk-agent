import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig } from "../../types.js";
import { createLmStudioAdapter } from "./lmstudio.js";
import { createOpenAiAdapter } from "./openai.js";
import { createAnthropicAdapter } from "./anthropic.js";

/**
 * Create the right adapter for a given provider config.
 * Pure factory — returns a new adapter instance each time.
 */
export function createAdapter(config: ProviderConfig): ProviderAdapter {
  switch (config.type) {
    case "lmstudio":
      return createLmStudioAdapter(config);
    case "openai":
      return createOpenAiAdapter(config);
    case "anthropic":
      return createAnthropicAdapter(config);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
