import type { LibData } from "./types.js";

export async function getLibData(): Promise<LibData> {
  return {
    message: "Hello from lib!",
  };
}
