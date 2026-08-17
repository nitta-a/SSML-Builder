import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    react: "src/react.tsx",
    elements: "src/elements.ts",
  },
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: {
    resolve: [
      "@ssml-builder-js/ssml-core",
      "@ssml-builder-js/ssml-editor-react",
      "@ssml-builder-js/ssml-editor-elements",
    ],
    compilerOptions: {
      composite: false,
      ignoreDeprecations: "6.0",
      allowImportingTsExtensions: true,
      emitDeclarationOnly: true,
      jsx: "react-jsx",
    },
  },
  sourcemap: true,
  clean: true,
  noExternal: [
    "@ssml-builder-js/ssml-core",
    "@ssml-builder-js/ssml-editor-react",
    "@ssml-builder-js/ssml-editor-elements",
  ],
});
