import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);

const CredentialTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("env"), name: NonEmptyString }).strict(),
  z.object({
    kind: z.literal("header"),
    name: NonEmptyString,
    prefix: z.string().optional(),
  }).strict(),
]);

const ConnectionSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: NonEmptyString,
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
  }).strict(),
  z.object({
    transport: z.enum(["streamable-http", "sse"]),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  }).strict(),
]);

export const ManagedMcpManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: NonEmptyString,
  emoji: z.string().optional(),
  active: z.boolean(),
  instruction: z.string(),
  connection: ConnectionSchema,
  credentials: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: NonEmptyString,
    description: z.string().optional(),
    required: z.boolean(),
    target: CredentialTargetSchema,
  }).strict()).default([]),
  allowedTools: z.array(NonEmptyString).optional(),
  concurrencySafe: z.boolean().default(false),
  connectTimeoutMs: z.number().int().positive().max(120_000).optional(),
  resultPolicy: z.object({
    previewThresholdChars: z.number().int().positive().optional(),
    previewChars: z.number().int().positive().optional(),
  }).strict().optional(),
}).strict().superRefine((manifest, ctx) => {
  const ids = new Set<string>();
  const targets = new Set<string>();
  const expectedTarget = manifest.connection.transport === "stdio" ? "env" : "header";
  for (const [index, credential] of manifest.credentials.entries()) {
    if (ids.has(credential.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", index, "id"], message: "Credential ids must be unique." });
    }
    ids.add(credential.id);
    const targetKey = `${credential.target.kind}:${credential.target.name.toLowerCase()}`;
    if (targets.has(targetKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", index, "target"], message: "Credential targets must be unique." });
    }
    targets.add(targetKey);
    if (credential.target.kind !== expectedTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credentials", index, "target", "kind"],
        message: `${manifest.connection.transport} credentials must target ${expectedTarget}.`,
      });
    }
  }
});

export type ManagedMcpManifest = z.infer<typeof ManagedMcpManifestSchema>;
