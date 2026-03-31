export function logUiError(scope: string, err: unknown): void {
  console.error(`[ui:${scope}]`, err);
}
