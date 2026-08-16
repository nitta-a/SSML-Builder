const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const workspacePackagePaths = [
  "packages/ssml-core/package.json",
  "packages/ssml-editor-react/package.json",
  "packages/azure-tts-client/package.json",
];

const workspacePackagePath = workspacePackagePaths
  .map((relativePath) => path.join(repoRoot, relativePath))
  .find((fullPath) => fs.existsSync(fullPath));

if (!workspacePackagePath) {
  throw new Error("No workspace package.json found to sync the root version from.");
}

const workspacePackage = JSON.parse(fs.readFileSync(workspacePackagePath, "utf8"));
const version = workspacePackage.version;

if (!version) {
  throw new Error(`Version not found in ${path.relative(repoRoot, workspacePackagePath)}.`);
}

const rootPackagePath = path.join(repoRoot, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));

rootPackage.version = version;
fs.writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

console.log(
  `Synced root package.json version to ${version} from ${path.relative(repoRoot, workspacePackagePath)}.`
);
