export function createSlugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function dedupeIds(ids: string[], required: string[] = []): string[] {
  return [...new Set([...ids, ...required])];
}

export function filterToKnownIds(
  ids: string[],
  known: Iterable<string>,
  required: string[] = [],
): string[] {
  const knownSet = new Set(known);
  return [...new Set([...required, ...ids])].filter((id) => knownSet.has(id));
}
