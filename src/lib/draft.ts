export function cloneDraft<T>(value: T): T {
  return structuredClone(value);
}
