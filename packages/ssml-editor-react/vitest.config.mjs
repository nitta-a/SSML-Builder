import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ssml-builder-js/ssml-core": fileURLToPath(new URL("../ssml-core/src/index.ts", import.meta.url)),
    },
  },
});
