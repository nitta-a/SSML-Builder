# Repository Guide

## Overview

SSML-Builder is a TypeScript monorepo for generating and parsing Azure Speech SSML, editing it with a React component, and synthesizing audio through Azure Text-to-Speech. It uses npm workspaces for both `packages/*` and `apps/*`.

## Repository Layout

- `packages/ssml-core`: Core SSML types, document building, parsing, and validation.
- `packages/ssml-editor-react`: React SSML editor built with Monaco Editor.
- `packages/azure-tts-client`: Microsoft Speech SDK client for Azure Text-to-Speech.
- `packages/*/src`: Package implementation and public entry points.
- `packages/*/test`: Node.js test files for the packages.
- `apps/playground/app`: Next.js playground application.
- `apps/playground/app/api/synthesize/route.ts`: Server-side route that validates SSML and calls Azure TTS.
- `biome.json`: Repository-wide Biome formatter and linter configuration.
- `.github/workflows/ci.yml`: CI jobs for formatting, linting, and tests.
- `packages/*/dist` and `apps/playground/.next`: Generated output; do not edit or commit it.

## Setup and Commands

Use Node.js 24 or later, matching CI. From the repository root:

```sh
npm ci
```

The root scripts delegate to workspaces when a workspace defines the requested script:

| Command | Purpose |
| --- | --- |
| `npm run format` | Check formatting with Biome |
| `npm run format:write` | Apply Biome formatting |
| `npm run lint` | Run Biome static checks |
| `npm run check` | Alias for the Biome checks |
| `npm run typecheck` | Type-check all workspaces that define the script |
| `npm run build` | Build all workspaces that define the script |
| `npm test` | Run tests in workspaces that define the script |
| `npm run dev --workspace playground` | Start the Next.js playground |

Package tests use Node.js's built-in test runner with TypeScript strip-types support. The playground has a build and typecheck script but no test script. The current CI workflow runs `npm run format`, `npm run lint`, and `npm test`; run typechecking and builds locally when validating changes that affect them.

## Development Guidelines

- Keep package implementation in that package's `src` directory and export public APIs from its `src/index.ts` or `src/index.tsx` entry point.
- Keep playground code under `apps/playground/app`; keep Azure credentials in the server-side route rather than browser code.
- Preserve the repository's strict TypeScript and ES module configuration.
- Use Biome rather than Prettier. Follow `biome.json` and the existing style: two-space indentation, double-quoted strings, trailing commas, and a 120-character line width.
- Keep dependencies and workspace references in each package's `package.json`; keep the root `package-lock.json` in sync with dependency changes.
- Do not commit `node_modules`, generated output, build caches, local environment files, or credentials. `.env.example` files may be committed.
- Supply Azure credentials at runtime through `AzureTtsClientOptions` or the playground's `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and optional `AZURE_SPEECH_ENDPOINT` environment variables. Never hard-code, expose to the browser, or log subscription keys or full SSML content.
- When public package APIs change, update the relevant README documentation and include a Changeset when the release requires one.

## Pull Requests

Keep changes focused and include the validation commands that were run. Do not edit generated output; regenerate it only to validate a build. Check the CI workflow when changing repository configuration or when diagnosing CI failures.
