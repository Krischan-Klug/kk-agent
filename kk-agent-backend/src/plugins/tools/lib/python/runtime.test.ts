import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pythonDefinition } from "./definition.js";
import { disposePythonSandbox, runPythonSandbox } from "./runner.js";
import { executePythonTool } from "./runtime.js";
import { pythonTools } from "./tools.js";

test("python executes algorithms with stdout and a final value", async () => {
  const result = await runPythonSandbox("values = []\nfor _ in range(6):\n    values.append(_ * _)\nprint(values)\nsum(values)");
  assert.equal(result.ok, true, result.error);
  assert.match(result.stdout, /\[0, 1, 4, 9, 16, 25\]/u);
  assert.equal(result.result, "55");
});

test("python supports normal standard-library imports", async () => {
  const result = await runPythonSandbox([
    "import base64, hashlib, io, json, pathlib, struct, uuid, zipfile, zlib",
    "payload = struct.pack('>I', 42)",
    "with zipfile.ZipFile('/output/data.zip', 'w') as archive:",
    "    archive.writestr('answer.json', json.dumps({'value': 42}))",
    "(base64.b64encode(payload).decode(), hashlib.sha256(payload).hexdigest(), str(uuid.UUID(int=0)), isinstance(pathlib.Path('/output/data.zip'), pathlib.Path), len(zlib.compress(payload)))",
  ].join("\n"));
  assert.equal(result.ok, true, result.error);
  assert.match(result.result ?? "", /AAAAKg==/u);
  assert.equal(result.artifacts[0]?.filename, "data.zip");
});

test("python supports ordinary metadata and Python introspection", async () => {
  const result = await runPythonSandbox([
    "from dataclasses import dataclass",
    "@dataclass",
    "class Counter:",
    "    _value: int = 0",
    "    def add(self, amount):",
    "        self._value += amount",
    "        return self._value",
    "def make_counter():",
    "    value = 0",
    "    def increment():",
    "        nonlocal value",
    "        value += 1",
    "        return value",
    "    return increment",
    "def values():",
    "    yield from range(3)",
    "counter = Counter()",
    "increment = make_counter()",
    "('__text is harmless', counter.add(4), increment(), increment(), list(values()), type(counter) is Counter)",
  ].join("\n"));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "('__text is harmless', 4, 1, 2, [0, 1, 2], True)");

  const metadata = await runPythonSandbox([
    "import decimal, json",
    "class Example:",
    "    'example documentation'",
    "try:",
    "    raise ValueError('expected')",
    "except Exception as error:",
    "    error_name = type(error).__name__",
    "(json.__name__, json.__doc__ is not None, isinstance(decimal.__version__, str), Example.__name__, Example.__doc__, error_name)",
  ].join("\n"));
  assert.equal(metadata.ok, true, metadata.error);
  assert.equal(metadata.result, "('json', True, True, 'Example', 'example documentation', 'ValueError')");

  const introspection = await runPythonSandbox("(len(object.__subclasses__()) > 0, getattr(str, '__name__'), callable(getattr(object, '__subclasses__'))) ");
  assert.equal(introspection.ok, true, introspection.error);
  assert.equal(introspection.result, "(True, 'str', True)");
});

test("python exposes exact input paths through INPUT_FILES", async () => {
  const result = await runPythonSandbox(
    "path = INPUT_FILES['asset-1']\nwith open(path) as file:\n    content = file.read().strip()\ncontent",
    [{ assetId: "asset-1", filename: "input data.txt", data: Buffer.from("mapped correctly\n") }],
  );
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "'mapped correctly'");
});

test("python supports curated creative packages and valid image artifacts", async () => {
  const result = await runPythonSandbox([
    "from PIL import Image",
    "import imageio.v3 as iio",
    "import networkx as nx",
    "import numpy as np",
    "from shapely.geometry import Point",
    "image = Image.new('RGB', (3, 2), (12, 34, 56))",
    "image.save('/output/pillow.png')",
    "iio.imwrite('/output/imageio.png', np.zeros((2, 2, 3), dtype=np.uint8))",
    "(image.size, nx.path_graph(4).number_of_edges(), round(Point(0, 0).buffer(1).area, 2))",
  ].join("\n"), [], 30);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.packages.sort(), ["imageio", "networkx", "numpy", "pillow", "shapely"]);
  assert.equal(result.result, "((3, 2), 3, 3.14)");
  assert.deepEqual(result.artifacts.map((artifact) => artifact.filename).sort(), ["imageio.png", "pillow.png"]);
  assert.deepEqual(result.artifacts[0]?.data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

test("python returns files created in the isolated output directory", async () => {
  const result = await runPythonSandbox("with open('/output/result.csv', 'w') as file:\n    file.write('x,y\\n1,2\\n')\n'ready'");
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "'ready'");
  assert.equal(result.artifacts[0]?.filename, "result.csv");
  assert.equal(result.artifacts[0]?.data.toString("utf8"), "x,y\n1,2\n");
});

test("python can generate 3D and binary artifacts", async () => {
  const result = await runPythonSandbox([
    "import numpy as np, struct",
    "with open('/output/triangle.obj', 'w') as file:",
    "    file.write('v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nf 1 2 3\\n')",
    "header = b'KK-Agent STL'.ljust(80, b' ')",
    "facet = struct.pack('<12fH', 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0)",
    "with open('/output/triangle.stl', 'wb') as file:",
    "    file.write(header + struct.pack('<I', 1) + facet)",
    "np.save('/output/vertices.npy', np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float))",
    "'created'",
  ].join("\n"));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "'created'");
  assert.deepEqual(result.artifacts.map((artifact) => artifact.filename).sort(), ["triangle.obj", "triangle.stl", "vertices.npy"]);
});

test("python supports managed Trimesh for high-level 3D generation", async () => {
  const result = await runPythonSandbox([
    "import trimesh",
    "mesh = trimesh.creation.box(extents=(1, 2, 3))",
    "mesh.export('/output/box.glb')",
    "(len(mesh.vertices), len(mesh.faces))",
  ].join("\n"), [], 30);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.packages, ["trimesh"]);
  assert.equal(result.result, "(8, 12)");
  assert.equal(result.artifacts[0]?.filename, "box.glb");
  assert.equal(result.artifacts[0]?.data.toString("ascii", 0, 4), "glTF");
});

test("python permits normal imports while isolating host bridges, paths, processes, and network", async () => {
  const imports = await runPythonSandbox([
    "import builtins, platform, socket, subprocess, sys, urllib.request",
    "(platform.python_implementation(), builtins.eval('6 * 7'), socket.__name__, subprocess.__name__, sys.platform, urllib.request.__name__)",
  ].join("\n"));
  assert.equal(imports.ok, true, imports.error);
  assert.match(imports.result ?? "", /^\('CPython', 42, 'socket', 'subprocess', 'emscripten', 'urllib\.request'\)$/u);

  const virtualFilesystem = await runPythonSandbox("import os\n(os.path.isdir('/input'), os.path.isdir('/output'), os.path.isdir('/workspace'), os.path.exists('C:/Users'), os.path.exists('/etc/passwd'))");
  assert.equal(virtualFilesystem.ok, true, virtualFilesystem.error);
  assert.equal(virtualFilesystem.result, "(True, True, True, False, False)");

  const hostBridge = await runPythonSandbox("import js\n(hasattr(js, 'process'), hasattr(js, 'require'), hasattr(js, 'fetch'), hasattr(js, 'globalThis'))");
  assert.equal(hostBridge.ok, true, hostBridge.error);
  assert.equal(hostBridge.result, "(False, False, False, False)");

  const unavailableCapabilities = await runPythonSandbox([
    "import socket, subprocess, urllib.request",
    "failures = []",
    "for operation in (",
    "    lambda: urllib.request.urlopen('https://example.com', timeout=0.1),",
    "    lambda: subprocess.run(['python', '--version']),",
    "):",
    "    try:",
    "        operation()",
    "        failures.append('unexpected-success')",
    "    except Exception as error:",
    "        failures.append(type(error).__name__)",
    "failures",
  ].join("\n"));
  assert.equal(unavailableCapabilities.ok, true, unavailableCapabilities.error);
  assert.match(unavailableCapabilities.result ?? "", /^\['[A-Za-z]+Error', '[A-Za-z]+Error'\]$/u);
  assert.doesNotMatch(unavailableCapabilities.result ?? "", /unexpected-success/u);
});

test("python process-like APIs cannot corrupt the dedicated runner protocol", async () => {
  for (const code of [
    "import os\nos.system('echo direct')",
    "import os\ngetattr(os, 'sy' + 'stem')('echo dynamic')",
    "import operator, os\noperator.attrgetter('system')(os)('echo indirect')",
  ]) {
    const result = await runPythonSandbox(code);
    assert.doesNotMatch(result.error ?? "", /Invalid Python runner response/u);
    assert.notEqual(result.errorKind, "runtime_error");
  }
});

test("python loads compatible packages from the bundled catalog without an allowlist", async () => {
  const result = await runPythonSandbox("import yaml\nyaml.safe_load('value: 42')['value']", [], 30);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "42");
  assert.ok(result.packages.includes("pyyaml"));
});

test("python preserves interpreter and workspace state within one session", async () => {
  const sessionId = `python-test-${randomUUID()}`;
  try {
    const first = await runPythonSandbox([
      "counter = 41",
      "with open('/workspace/state.txt', 'w') as file:",
      "    _ = file.write('kept')",
      "with open('/output/first.txt', 'w') as file:",
      "    _ = file.write('first')",
    ].join("\n"), [], 20, undefined, sessionId);
    assert.equal(first.ok, true, first.error);
    assert.equal(first.artifacts[0]?.filename, "first.txt");

    const second = await runPythonSandbox([
      "counter += 1",
      "with open('/workspace/state.txt') as file:",
      "    saved = file.read()",
      "(counter, saved)",
    ].join("\n"), [], 20, undefined, sessionId);
    assert.equal(second.ok, true, second.error);
    assert.equal(second.result, "(42, 'kept')");
    assert.deepEqual(second.artifacts, []);
  } finally {
    await disposePythonSandbox(sessionId);
  }
});

test("python tool binds persistent state to the runtime session", async () => {
  const sessionId = `python-tool-${randomUUID()}`;
  const context = { sessionId, values: {} };
  try {
    const first = await executePythonTool(pythonDefinition, "Python", { code: "tool_value = 20" }, context);
    assert.equal(first?.isError, undefined, first?.content);
    const second = await executePythonTool(pythonDefinition, "Python", { code: "tool_value + 22" }, context);
    assert.equal(second?.isError, undefined, second?.content);
    assert.match(second?.content ?? "", /Result:\n42/u);
  } finally {
    await disposePythonSandbox(sessionId);
  }
});

test("python resets a persistent session after timeout", async () => {
  const sessionId = `python-timeout-${randomUUID()}`;
  try {
    const initialized = await runPythonSandbox("marker = 'old'", [], 20, undefined, sessionId);
    assert.equal(initialized.ok, true, initialized.error);
    const timedOut = await runPythonSandbox("while True:\n    pass", [], 1, undefined, sessionId);
    assert.equal(timedOut.errorKind, "timeout");
    const recovered = await runPythonSandbox("globals().get('marker', 'clean')", [], 20, undefined, sessionId);
    assert.equal(recovered.ok, true, recovered.error);
    assert.equal(recovered.result, "'clean'");
  } finally {
    await disposePythonSandbox(sessionId);
  }
});

test("python control responses remain valid when native stdout is used", async () => {
  const result = await runPythonSandbox("import os\nos.write(1, b'native output\\n')\n42");
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result, "42");
});

test("python enforces timeout and cancellation", async () => {
  const timedOut = await runPythonSandbox("while True:\n    pass", [], 1);
  assert.equal(timedOut.errorKind, "timeout");

  const recovered = await runPythonSandbox("sum(range(11))");
  assert.equal(recovered.ok, true, recovered.error);
  assert.equal(recovered.result, "55");

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runPythonSandbox("42", [], 10, controller.signal);
  assert.equal(cancelled.errorKind, "cancelled");
});

test("python tool rejects missing code and ignores unknown names", async () => {
  const missing = await executePythonTool(pythonDefinition, "Python", {});
  assert.equal(missing?.isError, true);
  assert.equal(await executePythonTool(pythonDefinition, "Other", {}), null);
});

test("python tool exposes the package-friendly default timeout", () => {
  const schema = pythonTools[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const timeout = schema?.properties?.timeout_seconds as { default?: number } | undefined;
  assert.equal(timeout?.default, 20);
});
