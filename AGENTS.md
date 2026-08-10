# Repository Guide

## Overview

SSML-Builder is a TypeScript monorepo for editing and generating Azure Speech SSML through reusable code and React components. Packages are managed with npm workspaces under `packages/*`.

## Repository Layout

- `packages/ssml-core`: Core SSML types and document-building utilities.
- `packages/ssml-editor-react`: React editor component built on the core package.
- `packages/azure-tts-client`: Client for synthesizing SSML with Azure Text-to-Speech.
- `packages/*/src`: Package source files.
- `packages/*/dist`: Generated build output; do not edit or commit it.
- `.github/workflows/ci.yml`: CI checks for formatting, typechecking, and tests.

## Setup and Commands

Use Node.js 24, matching CI. From the repository root:

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm run build
npm test
```

`npm run format` checks Prettier formatting. `npm run typecheck` is the canonical workspace typecheck command, and `npm run lint` is its CI-compatible alias. Builds and tests are delegated to workspaces when a package defines the corresponding script. Run the relevant command after making changes, and run the full command set before submitting a broad change.

## Development Guidelines

- Keep package-specific implementation in that package's `src` directory.
- Export public APIs from the package entry point (`src/index.ts` or `src/index.tsx`).
- Preserve strict TypeScript settings and the project’s existing ES module configuration.
- Use Prettier’s existing style: double-quoted strings, trailing commas, and formatted JSX.
- Keep package dependencies and workspace references in the package’s `package.json`.
- Do not commit generated output, dependency directories, build caches, or credentials.
- Azure TTS credentials must be supplied at runtime through `AzureTtsClientOptions`; never hard-code or log subscription keys.

## Pull Requests

Keep changes focused, update relevant package documentation when public APIs change, and include the validation commands that were run. CI runs formatting, linting, and tests on pull requests.
