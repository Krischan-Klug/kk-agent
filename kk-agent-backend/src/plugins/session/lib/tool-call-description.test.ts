import test from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_CALL_DESCRIPTION_KEY,
  withToolCallDescriptionSchema,
  stripDisplayOnlyInputKeys,
} from "./tool-call-description.js";

test("withToolCallDescriptionSchema adds tool_call_description to object schema", () => {
  const schema = {
    type: "object",
    properties: {
      file_path: { type: "string" },
    },
    required: ["file_path"],
  };

  const result = withToolCallDescriptionSchema(schema);

  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "tool_call_description" in result.schema.properties,
  );
  assert.deepEqual(result.displayOnlyInputKeys, ["tool_call_description"]);
  assert.deepEqual(result.schema.required, ["file_path"]);
});

test("withToolCallDescriptionSchema does not mutate original schema", () => {
  const schema = {
    type: "object",
    properties: {
      file_path: { type: "string" },
    },
    required: ["file_path"],
  };

  withToolCallDescriptionSchema(schema);

  assert.equal(Object.keys(schema.properties).length, 1);
});

test("withToolCallDescriptionSchema does not override existing tool_call_description", () => {
  const schema = {
    type: "object",
    properties: {
      file_path: { type: "string" },
      tool_call_description: { type: "string", description: "Custom." },
    },
    required: ["file_path"],
  };

  const result = withToolCallDescriptionSchema(schema);

  assert.deepEqual(
    (result.schema.properties as Record<string, unknown>).tool_call_description,
    { type: "string", description: "Custom." },
  );
  assert.deepEqual(result.displayOnlyInputKeys, []);
});

test("withToolCallDescriptionSchema handles anyOf with object variant", () => {
  const schema = {
    anyOf: [
      { type: "string" },
      {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    ],
  };

  const result = withToolCallDescriptionSchema(schema);

  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "tool_call_description" in result.schema.properties,
  );
});

test("withToolCallDescriptionSchema handles oneOf with object variant", () => {
  const schema = {
    oneOf: [
      { type: "string" },
      {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    ],
  };

  const result = withToolCallDescriptionSchema(schema);

  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "tool_call_description" in result.schema.properties,
  );
});

test("withToolCallDescriptionSchema handles allOf by merging object parts", () => {
  const schema = {
    allOf: [
      {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
      {
        type: "object",
        properties: { offset: { type: "number" } },
      },
    ],
  };

  const result = withToolCallDescriptionSchema(schema);

  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "tool_call_description" in result.schema.properties,
  );
  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "file_path" in result.schema.properties,
  );
  assert.ok(
    typeof result.schema.properties === "object" &&
      result.schema.properties !== null &&
      "offset" in result.schema.properties,
  );
});

test("stripDisplayOnlyInputKeys removes specified keys", () => {
  const input = { file_path: "a", tool_call_description: "Read." };
  const result = stripDisplayOnlyInputKeys(input, ["tool_call_description"]);

  assert.equal("file_path" in result, true);
  assert.equal("tool_call_description" in result, false);
});

test("stripDisplayOnlyInputKeys returns input unchanged when keys is empty", () => {
  const input = { file_path: "a", tool_call_description: "Read." };
  const result = stripDisplayOnlyInputKeys(input, undefined);

  assert.deepEqual(result, input);
});

test("stripDisplayOnlyInputKeys returns input unchanged when keys is empty array", () => {
  const input = { file_path: "a", tool_call_description: "Read." };
  const result = stripDisplayOnlyInputKeys(input, []);

  assert.deepEqual(result, input);
});
