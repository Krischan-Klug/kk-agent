import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig } from "../../types.js";
import { createLocalProviderAdapter } from "./local.js";

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createLocalProviderAdapter(config);
}
