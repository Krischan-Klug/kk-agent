import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CredentialCipher {
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
}

type StoredCredentials = {
  version: 1;
  credentials: Record<string, string>;
};

const EMPTY_STORE: StoredCredentials = { version: 1, credentials: {} };
const CREDENTIAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

function assertCredentialId(id: string): void {
  if (!CREDENTIAL_ID.test(id)) throw new Error("Invalid credential id.");
}

export class CredentialStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly cipher: CredentialCipher,
  ) {}

  private async mutate(operation: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.catch(() => undefined).then(operation);
    this.mutationQueue = next;
    await next;
  }

  private async read(): Promise<StoredCredentials> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) {
        throw new Error("Unsupported credential store format.");
      }
      const credentials = (parsed as { credentials?: unknown }).credentials;
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
        throw new Error("Invalid credential store.");
      }
      const entries = Object.entries(credentials);
      if (!entries.every(([id, value]) => CREDENTIAL_ID.test(id) && typeof value === "string")) {
        throw new Error("Invalid credential store entries.");
      }
      return { version: 1, credentials: Object.fromEntries(entries) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_STORE);
      throw error;
    }
  }

  private async write(state: StoredCredentials): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async set(id: string, value: string): Promise<void> {
    await this.setMany({ [id]: value });
  }

  async setMany(values: Record<string, string>): Promise<void> {
    for (const [id, value] of Object.entries(values)) {
      assertCredentialId(id);
      if (!value) throw new Error("Credential value must not be empty.");
    }
    await this.mutate(async () => {
      const state = await this.read();
      for (const [id, value] of Object.entries(values)) {
        state.credentials[id] = (await this.cipher.encrypt(value)).toString("base64");
      }
      await this.write(state);
    });
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async removeMany(ids: string[]): Promise<void> {
    for (const id of ids) assertCredentialId(id);
    await this.mutate(async () => {
      const state = await this.read();
      let changed = false;
      for (const id of ids) {
        if (!(id in state.credentials)) continue;
        delete state.credentials[id];
        changed = true;
      }
      if (changed) await this.write(state);
    });
  }

  async readAll(): Promise<Record<string, string>> {
    await this.mutationQueue.catch(() => undefined);
    const state = await this.read();
    const entries = await Promise.all(Object.entries(state.credentials).map(async ([id, encrypted]) => [
      id,
      await this.cipher.decrypt(Buffer.from(encrypted, "base64")),
    ] as const));
    return Object.fromEntries(entries);
  }
}
