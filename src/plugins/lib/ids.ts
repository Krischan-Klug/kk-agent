export function createSlugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeMcpId(id: string): string {
  return id === "commands" ? "terminal" : id;
}
