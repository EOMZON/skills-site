import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const siteRoot = path.resolve(import.meta.dirname, "..");
const registryRoot = path.resolve(siteRoot, "..", "skills-registry");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-site-recovery-"));
const fixtureSite = path.join(fixtureRoot, "skills-site");
const fixtureRegistry = path.join(fixtureRoot, "skills-registry");

function copy(sourceRoot, targetRoot, relativePath) {
  fs.cpSync(path.join(sourceRoot, relativePath), path.join(targetRoot, relativePath), { recursive: true });
}

function digestTree(root) {
  const hash = crypto.createHash("sha256");
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relativePath}\0`);
      if (entry.isDirectory()) walk(fullPath);
      else hash.update(fs.readFileSync(fullPath));
    }
  };
  walk(root);
  return hash.digest("hex");
}

for (const relativePath of ["dist", "scripts/build-site.mjs", "src"]) copy(siteRoot, fixtureSite, relativePath);
copy(registryRoot, fixtureRegistry, "content");

const registry = JSON.parse(fs.readFileSync(path.join(fixtureRegistry, "content", "registry.json"), "utf8"));
const manifestPath = path.join(fixtureRegistry, registry.skills[0].manifest_path);
fs.writeFileSync(manifestPath, "{ invalid-manifest\n");
fs.appendFileSync(path.join(fixtureSite, "src", "site.css"), "\n/* must-not-leak-from-failed-build */\n");

const distRoot = path.join(fixtureSite, "dist");
const before = digestTree(distRoot);
const result = spawnSync(process.execPath, [path.join(fixtureSite, "scripts", "build-site.mjs")], {
  cwd: fixtureSite,
  encoding: "utf8",
  env: { ...process.env, SKILLS_REGISTRY_ROOT: fixtureRegistry }
});

assert.notEqual(result.status, 0, "invalid manifest must fail the build");
assert.match(`${result.stdout}\n${result.stderr}`, /SyntaxError|JSON/, "failure must expose the invalid manifest boundary");
assert.equal(digestTree(distRoot), before, "failed registry validation must preserve the complete last-known-good dist");

console.log("Skills build recovery PASS: invalid manifest fails before changed site assets can enter last-known-good dist");
