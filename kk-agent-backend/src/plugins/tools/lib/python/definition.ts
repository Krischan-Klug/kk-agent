import { defineInternalTool } from "../internal-tool-definition.js";

export const pythonDefinition = defineInternalTool({
  id: "python",
  name: "Python",
  instruction:
    "Use Python for algorithms, simulation, data processing, code validation, plotting, file conversion, or generating artifacts such as images and 3D models. " +
    "Use Calculate instead for a direct expression. Python uses a session-scoped isolated runtime: normal Python language features, standard-library imports, variables, and files under /workspace are available across calls in the same session. " +
    "The runtime has no host filesystem mount or host JavaScript globals. Native processes and external network access are not provided by the WebAssembly runtime. A timeout, cancellation, or runtime crash discards the current runtime and the next call starts clean. " +
    "For input assets, always read the exact path from INPUT_FILES[assetId]; never guess an /input path. /input and /output are reset for every call; any valid non-empty file written under /output is returned as a session artifact.",
  emoji: "🐍",
  config: {
    resultPolicy: { previewThresholdChars: 24_000, previewChars: 16_000 },
  },
});
