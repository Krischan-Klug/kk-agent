const TOOL_CALL_DESCRIPTION_KEY = "tool_call_description";

const SCHEMA_DESCRIPTION =
  "Short active-voice description of the immediate tool action shown to the user.";

export function withToolCallDescriptionSchema(
  schema: Record<string, unknown>,
): {
  schema: Record<string, unknown>;
  displayOnlyInputKeys: string[];
} {
  const normalized = normalizeTopLevelObjectSchema(schema);

  if (
    normalized.properties &&
    typeof normalized.properties === "object" &&
    TOOL_CALL_DESCRIPTION_KEY in (normalized.properties as Record<string, unknown>)
  ) {
    return { schema: normalized, displayOnlyInputKeys: [] };
  }

  const properties = {
    ...(typeof normalized.properties === "object" && normalized.properties !== null
      ? (normalized.properties as Record<string, unknown>)
      : {}),
    [TOOL_CALL_DESCRIPTION_KEY]: {
      type: "string",
      description: SCHEMA_DESCRIPTION,
    },
  };

  return {
    schema: {
      ...normalized,
      properties,
    },
    displayOnlyInputKeys: [TOOL_CALL_DESCRIPTION_KEY],
  };
}

export function stripDisplayOnlyInputKeys(
  input: Record<string, unknown>,
  keys: string[] | undefined,
): Record<string, unknown> {
  if (!keys || keys.length === 0) return input;

  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) {
      stripped[key] = value;
    }
  }
  return stripped;
}

function normalizeTopLevelObjectSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (schema.type === "object") {
    return schema;
  }

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const objectVariant = schema.anyOf.find(
      (variant): variant is Record<string, unknown> =>
        typeof variant === "object" &&
        variant !== null &&
        (variant as Record<string, unknown>).type === "object",
    );
    if (objectVariant) {
      return objectVariant;
    }
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const objectVariant = schema.oneOf.find(
      (variant): variant is Record<string, unknown> =>
        typeof variant === "object" &&
        variant !== null &&
        (variant as Record<string, unknown>).type === "object",
    );
    if (objectVariant) {
      return objectVariant;
    }
  }

  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged = mergeAllOf(schema.allOf as Record<string, unknown>[]);
    if (merged.type === "object") {
      return merged;
    }
  }

  return schema;
}

function mergeAllOf(parts: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = { type: "object" };
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const part of parts) {
    if (part.type && !result.type) {
      result.type = part.type;
    }
    if (part.properties && typeof part.properties === "object") {
      Object.assign(properties, part.properties);
    }
    if (Array.isArray(part.required)) {
      required.push(...part.required);
    }
  }

  if (Object.keys(properties).length > 0) {
    result.properties = properties;
  }
  if (required.length > 0) {
    result.required = [...new Set(required)];
  }

  return result;
}
