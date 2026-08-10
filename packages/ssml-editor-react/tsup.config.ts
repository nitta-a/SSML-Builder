import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      composite: false,
      ignoreDeprecations: "6.0",
    },
  },
  sourcemap: true,
  clean: true,
  banner: {
    js: '"use client";',
  },
});
