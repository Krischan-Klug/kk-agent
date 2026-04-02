import { useCallback, useState } from "react";

export function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function addSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.add(value);
  return next;
}

export function removeSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.delete(value);
  return next;
}

export function useToggleSet(initial?: Iterable<string>) {
  const [values, setValues] = useState(() => new Set(initial));

  const toggle = useCallback((value: string) => {
    setValues((current) => toggleSetValue(current, value));
  }, []);

  const add = useCallback((value: string) => {
    setValues((current) => addSetValue(current, value));
  }, []);

  const remove = useCallback((value: string) => {
    setValues((current) => removeSetValue(current, value));
  }, []);

  const has = useCallback((value: string) => values.has(value), [values]);

  return { values, setValues, toggle, add, remove, has };
}
