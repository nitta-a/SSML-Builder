const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootPackagePath = path.resolve(__dirname, "..", "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const registry = rootPackage.publishConfig?.registry ?? process.env.npm_config_registry;
const packageVersion = `${rootPackage.name}@${rootPackage.version}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmOptions = {
  cwd: path.dirname(rootPackagePath),
  encoding: "utf8",
  shell: process.platform === "win32",
};

const viewArgs = ["view", packageVersion, "version", "--json"];
if (registry) {
  viewArgs.push("--registry", registry);
}

const publishedVersion = spawnSync(npmCommand, viewArgs, {
  ...npmOptions,
  stdio: ["ignore", "pipe", "pipe"],
});

if (publishedVersion.status === 0) {
  console.log(`${packageVersion} is already published; skipping root package publish.`);
  process.exit(0);
}

const npmError = `${publishedVersion.stdout}\n${publishedVersion.stderr}`;
if (!npmError.includes("E404")) {
  process.stderr.write(npmError);
  process.exit(publishedVersion.status ?? 1);
}

const publishArgs = ["publish", "--access", "public"];
if (registry) {
  publishArgs.push("--registry", registry);
}

const publishResult = spawnSync(npmCommand, publishArgs, {
  ...npmOptions,
  stdio: "inherit",
});
process.exit(publishResult.status ?? 1);
