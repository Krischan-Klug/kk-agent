import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts",
    preload: "src/preload.ts",
  },
  bundle: true,
  clean: true,
  format: ["cjs"],
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  splitting: false,
  target: "node20",
  external: ["electron"],
});
