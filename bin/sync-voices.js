#!/usr/bin/env node

const { writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { fetchAzureVoiceCatalog } = require("../dist/index.js");

function usage() {
  return [
    "Usage: ssml-builder sync-voices --region <region[,region...]> --output <file>",
    "",
    "Environment variables: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION(S)",
  ].join("\n");
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--region" || argument === "--regions") {
      options.regions = (args[++index] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (argument === "--output") {
      options.output = args[++index];
    } else if (argument === "--key") {
      options.apiKey = args[++index];
    } else if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}\n\n${usage()}`);
    }
  }
  return options;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "sync-voices") throw new Error(usage());
  const options = parseArgs(args);
  const regions =
    options.regions ||
    (process.env.AZURE_SPEECH_REGIONS || process.env.AZURE_SPEECH_REGION || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  const apiKey = options.apiKey || process.env.AZURE_SPEECH_KEY;
  const output = options.output;
  if (!apiKey) throw new Error("Set AZURE_SPEECH_KEY or pass --key.");
  if (regions.length === 0) throw new Error("Set AZURE_SPEECH_REGION(S) or pass --region(s).");
  if (!output) throw new Error(`Pass --output <file>.\n\n${usage()}`);

  const catalog = await fetchAzureVoiceCatalog({ apiKey, region: regions });
  await writeFile(resolve(output), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Wrote ${catalog.metadata.voiceCount} Azure voice definitions to ${resolve(output)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
