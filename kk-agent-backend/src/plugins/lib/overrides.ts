export type JsonObject = Record<string, unknown>;

export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    cloned[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return cloned as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

export function hasOverride(value: unknown): boolean {
  if (value === undefined) return false;
  if (value === null) return true;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

export function applyOverrides<T>(base: T, overrides?: Partial<T>): T {
  if (!overrides || !hasOverride(overrides)) return deepClone(base);

  if (typeof base !== "object" || base === null) {
    return deepClone(overrides as unknown as T);
  }

  if (Array.isArray(base) || Array.isArray(overrides)) {
    return deepClone(overrides as unknown as T);
  }

  const result: Record<string, unknown> = deepClone(base as unknown as Record<string, unknown>);
  for (const key of Object.keys(overrides as object)) {
    const overrideVal = (overrides as Record<string, unknown>)[key];
    if (overrideVal === undefined) continue;

    const baseVal = result[key];
    if (
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = applyOverrides(baseVal, overrideVal as Record<string, unknown>);
    } else {
      result[key] = deepClone(overrideVal);
    }
  }

  return result as T;
}

export function diffOverrides<T>(base: T, effective: T): Partial<T> {
  if (deepEqual(base, effective)) return {} as Partial<T>;

  if (
    typeof base !== "object" ||
    base === null ||
    Array.isArray(base) ||
    typeof effective !== "object" ||
    effective === null ||
    Array.isArray(effective)
  ) {
    return deepClone(effective) as unknown as Partial<T>;
  }

  const diff: Record<string, unknown> = {};
  const baseObj = base as unknown as Record<string, unknown>;
  const effectiveObj = effective as unknown as Record<string, unknown>;

  for (const key of Object.keys(effectiveObj)) {
    const effectiveVal = effectiveObj[key];
    const baseVal = baseObj[key];

    if (!(key in baseObj)) {
      diff[key] = deepClone(effectiveVal);
      continue;
    }

    if (deepEqual(baseVal, effectiveVal)) {
      continue;
    }

    if (
      typeof effectiveVal === "object" &&
      effectiveVal !== null &&
      !Array.isArray(effectiveVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      const nestedDiff = diffOverrides(baseVal, effectiveVal);
      if (hasOverride(nestedDiff)) {
        diff[key] = nestedDiff;
      }
    } else {
      diff[key] = deepClone(effectiveVal);
    }
  }

  return diff as Partial<T>;
}
