export function toggleId(ids: string[], id: string, enabled?: boolean): string[] {
  const shouldInclude = enabled ?? !ids.includes(id);
  return shouldInclude
    ? ids.includes(id) ? ids : [...ids, id]
    : ids.filter((entry) => entry !== id);
}
