import type { CoreData } from "./types.js";

export async function getCoreData(): Promise<CoreData> {
  return {
    message: "Hello from core!",
  };
}
