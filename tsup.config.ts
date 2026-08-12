import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    react: "src/react.tsx",
    "azure-tts-client": "src/azure-tts-client.ts",
  },
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: {
    resolve: ["@ssml-builder-js/ssml-core"],
    compilerOptions: {
      composite: false,
      ignoreDeprecations: "6.0",
      allowImportingTsExtensions: true,
      jsx: "react-jsx",
    },
  },
  sourcemap: true,
  clean: true,
  noExternal: ["@ssml-builder-js/ssml-core", "@ssml-builder-js/ssml-editor-react", "@ssml-builder-js/azure-tts-client"],
});
