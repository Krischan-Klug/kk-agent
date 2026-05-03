export type ProviderVerificationResult = {
  ok: boolean;
  error?: string;
};

const providerVerificationCache = new Map<string, ProviderVerificationResult>();
const inflightProviderVerifications = new Map<string, Promise<ProviderVerificationResult>>();

function normalizeVerificationError(error: unknown): ProviderVerificationResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function getProviderVerificationSnapshot(): Record<string, ProviderVerificationResult> {
  return Object.fromEntries(providerVerificationCache.entries());
}

export function removeProviderVerification(id: string): void {
  providerVerificationCache.delete(id);
  inflightProviderVerifications.delete(id);
}

export async function verifyProvider(
  id: string,
  testProvider: (id: string) => Promise<ProviderVerificationResult>,
): Promise<ProviderVerificationResult> {
  const running = inflightProviderVerifications.get(id);
  if (running) return running;

  const request = (async () => {
    try {
      const result = await testProvider(id);
      providerVerificationCache.set(id, result);
      return result;
    } catch (error) {
      const result = normalizeVerificationError(error);
      providerVerificationCache.set(id, result);
      return result;
    } finally {
      inflightProviderVerifications.delete(id);
    }
  })();

  inflightProviderVerifications.set(id, request);
  return request;
}

export async function verifyProviders(
  ids: string[],
  testProvider: (id: string) => Promise<ProviderVerificationResult>,
  onResult?: (id: string, result: ProviderVerificationResult) => void,
): Promise<Record<string, ProviderVerificationResult>> {
  const entries = await Promise.all(ids.map(async (id) => {
    const result = await verifyProvider(id, testProvider);
    onResult?.(id, result);
    return [id, result] as const;
  }));

  return Object.fromEntries(entries);
}
