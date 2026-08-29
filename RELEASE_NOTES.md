# SSML-Builder v2.15.0 Release Notes

Release date: 2026-08-29

v2.15.0 adds strict audio merge formats, discriminated synthesis errors, per-event source mappings, abortable URL validation, external audio muxers, and live Visual Editor voice capability warnings.

## Highlights

- Added explicit audio merge format handling and clear errors for unsupported container formats.
- Added discriminated synthesis and chunk validation results with source-aware progress and synchronization metadata.
- Added abortable, timeout-aware URL validation with controlled concurrency and caching.
- Added external audio muxer support for formats that require container-aware merging.
- Added Visual Editor voice capability warnings and richer voice metadata display.

## Verification

- `npm run format` — passed
- `npm run lint` — passed
- `npm test` — passed
- `npm run typecheck` — passed
- `npm run build` — passed

# SSML-Builder v2.14.0 Release Notes

Release date: 2026-08-29

v2.14.0 adds container-aware audio merging, preflight-validated SSML chunk synthesis, structured progress events, source mapping metadata, controlled URL validation, and voice capability details in the Visual Editor.

## Highlights

- Added safe merging for PCM WAV and MP3 audio buffers, with explicit rejection of formats that require re-multiplexing.
- Added chunk synthesis preflight validation, chunk-addressable validation errors, and structured lifecycle progress events.
- Added source mapping metadata to synchronization events, including chunk indexes, source node paths, and original text ranges.
- Added URL validation deduplication, caching, bounded concurrency, cancellation, and timeout controls.
- Added voice capability details, regions, supported tags, and lifecycle status to the Visual Editor.

## Verification

- `npm run format` — passed
- `npm run lint` — passed
- `npm test` — passed
- `npm run typecheck` — passed
- `npm run build` — passed

# SSML-Builder v2.13.0 Release Notes

Release date: 2026-08-29

v2.13.0 adds structured SSML chunk metadata, safer preflight synthesis, merged synchronization offsets, chunk progress reporting, source tracking, and extensible Japanese-localized Visual Editor controls.

## Highlights

- Added structured `SsmlChunk` metadata with source text ranges, inherited context, markers, and configurable background-audio replication.
- Added chunked synthesis helpers that merge audio and accumulate boundary, viseme, and bookmark offsets.
- Added safe preflight synthesis with asynchronous custom URL validation and clear validation/Azure error results.
- Added chunk progress reporting and synthesis source tracking.
- Added extensible Visual Editor inspectors, voice selector rendering, catalog filtering, and Japanese-localized controls.

## Verification

- `npm run format` — passed
- `npm run lint` — passed
- `npm test` — passed (152 tests passed; 1 live Azure test skipped without credentials)
- `npm run typecheck` — passed
- `npm run build` — passed

# SSML-Builder v2.12.0 Release Notes

Release date: 2026-08-29

v2.12.0 adds full Visual Editor element inspectors, Azure Speech synchronization metadata, safe long-document splitting, and stricter XML depth/audio-origin validation.

## Highlights

- Added `splitSsmlDocument` for independently synthesizable SSML blocks that preserve parent context.
- Added `synthesizeSsml` and `SsmlSynthesisResult` with word boundaries, visemes, bookmarks, and duration in milliseconds.
- Added Visual Editor forms for voice, prosody, say-as, phoneme, audio, mark, bookmark, silence, duration, embedding, and voice conversion elements.
- Visual selection preview now retains the selected document's `speak`, `voice`, and `prosody` context.
- Added `maxXmlDepth` and stricter exact-origin allowlist handling for audio sources.

## Verification

- `npm run test` — passed
- `npm run typecheck` — passed
- `npm run build` — passed

## v2.6.0 Release Notes

Release date: 2026-08-26

v2.6.0 strengthens Azure SSML quality checks and synthesis cancellation coverage.

## Highlights

- `validateAzureSsml` warns when a voice name's locale prefix does not match the voice or speak `xml:lang`.
- Documented the three-stage validation model: XML syntax, static Azure semantics, and runtime API validation.
- Added cancellation, timeout, and optionally enabled live Azure Speech API synthesis tests.
- Documented the `customVoiceStyleMap` override workflow and the rationale for the default `unknownVoicePolicy: "warn"`.

## Verification

- `npm run test` — passed
- `npm run typecheck` — passed
- `npm run build` — passed

## v2.5.0

Release date: 2026-08-26

v2.5.0 adds safer Azure SSML validation, context-aware text mapping, React 18 compatibility, and production-oriented Azure TTS controls and examples.

### Highlights

### Azure SSML validation

- Added `AzureValidationOptions` for `validateAzureSsml`.
- Added `customVoiceStyleMap` for application-specific voice/style definitions.
- Added `unknownVoicePolicy`: `"error"`, `"warn"` (default), or `"ignore"`.
- Added `validateNestedVoices`, enabled by default, so nested `<voice>` elements are validated independently.
- External `<audio>` origins are blocked by default with `allowExternalAudio: false`.
- Use `allowedAudioOrigins` to allowlist origins, or explicitly opt in with `allowExternalAudio: true` after applying server-side SSRF controls.
- `AzureSsmlValidationOptions` remains available as a deprecated compatibility alias for `AzureValidationOptions`.

### Context-aware text mapping

`mapSsmlTextNodes` now accepts an optional third argument:

```ts
const mapped = await mapSsmlTextNodes(ssml, transform, {
  skipTags: ["phoneme", "say-as", "sub"],
  filter: ({ parentTag, parentAttributes, ancestorTags, path }) => true,
});
```

The transform context now includes `parentTag`, decoded `parentAttributes`, `ancestorTags`, and `path`. `phoneme`, `say-as`, and `sub` are skipped by default to avoid modifying pronunciation metadata. Pass `skipTags: []` to restore transformation of all text nodes.

### Azure TTS client

- Added `timeoutMs` to stop long-running synthesis requests.
- Added `signal` support for cancellation and client disconnect handling.
- Documented low-bandwidth MP3 formats:
  - `audio-24khz-48kbitrate-mono-mp3`
  - `audio-16khz-32kbitrate-mono-mp3`
- Added Next.js Route Handler guidance for keeping Azure credentials server-side, including timeout, cancellation, retry, and logging patterns.

### React compatibility

The root package now accepts:

```text
react: >=18.2.0 <20
react-dom: >=18.2.0 <20
```

This supports React 18.3.1 with both Next.js Pages Router and App Router applications.

### Upgrade notes

- If an application relies on translating text inside `phoneme`, `say-as`, or `sub`, pass `skipTags: []` or provide a customized list.
- Existing unknown Azure voices and unsupported styles now produce warnings by default. Set `unknownVoicePolicy: "error"` for strict validation or `"ignore"` to suppress metadata-map diagnostics.
- Applications using external `<audio>` URLs must configure `allowedAudioOrigins` or explicitly opt in to external audio. Keep URL validation, redirect restrictions, and response-size limits on the server.
- Azure subscription keys must remain server-side and must not be logged.

### Verification

- `npm test` — passed
- `npm run typecheck` — passed
- `npm run build` — passed
