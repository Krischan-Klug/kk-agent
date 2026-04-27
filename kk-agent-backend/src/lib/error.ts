export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

export function getErrnoCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as NodeJS.ErrnoException).code);
  }
  return undefined;
}
