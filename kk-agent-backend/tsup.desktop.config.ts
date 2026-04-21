import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  bundle: true,
  clean: true,
  format: ["cjs"],
  noExternal: [/.*/],
  outExtension() {
    return { js: ".cjs" };
  },
  outDir: "desktop-dist",
  platform: "node",
  sourcemap: true,
  splitting: false,
  target: "node20",
});
