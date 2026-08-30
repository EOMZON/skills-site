import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const siteRoot = path.resolve(import.meta.dirname, "..");
const registryRoot = path.resolve(siteRoot, "..", "skills-registry");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-site-registry-resolution-"));
const fixtureSite = path.join(fixtureRoot, "site");
const fixtureRegistry = path.join(fixtureRoot, "registry-source");
const fakeBin = path.join(fixtureRoot, "bin");
const fakeGit = path.join(fakeBin, "git");
const fakeGitLog = path.join(fixtureRoot, "git-argv.ndjson");
const shellSentinel = path.join(fixtureRoot, "shell-interpreted");

function copy(sourceRoot, targetRoot, relativePath) {
  fs.cpSync(path.join(sourceRoot, relativePath), path.join(targetRoot, relativePath), { recursive: true });
}

function runBuild(remoteUrl) {
  return spawnSync(process.execPath, [path.join(fixtureSite, "scripts", "build-site.mjs")], {
    cwd: fixtureSite,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      SKILLS_REGISTRY_GIT_URL: remoteUrl,
      FAKE_GIT_LOG: fakeGitLog,
      FAKE_REGISTRY_SOURCE: fixtureRegistry
    }
  });
}

try {
  copy(siteRoot, fixtureSite, "scripts/build-site.mjs");
  copy(siteRoot, fixtureSite, "src");
  copy(registryRoot, fixtureRegistry, "content");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    fakeGit,
    `#!${process.execPath}\n` +
      `const fs = require("node:fs");\n` +
      `const path = require("node:path");\n` +
      `const args = process.argv.slice(2);\n` +
      `fs.appendFileSync(process.env.FAKE_GIT_LOG, JSON.stringify(args) + "\\n");\n` +
      `if (args[0] === "clone") {\n` +
      `  const destination = args.at(-1);\n` +
      `  fs.mkdirSync(destination, { recursive: true });\n` +
      `  fs.cpSync(path.join(process.env.FAKE_REGISTRY_SOURCE, "content"), path.join(destination, "content"), { recursive: true });\n` +
      `  process.exit(0);\n` +
      `}\n` +
      `if (args[0] === "-C" && args[2] === "pull" && args[3] === "--ff-only") process.exit(0);\n` +
      `process.exit(64);\n`
  );
  fs.chmodSync(fakeGit, 0o755);

  const remoteUrl = `https://example.invalid/registry.git;touch ${shellSentinel}`;
  const cloneResult = runBuild(remoteUrl);
  assert.equal(cloneResult.status, 0, `${cloneResult.stdout}\n${cloneResult.stderr}`);
  assert.equal(fs.existsSync(shellSentinel), false, "registry URL must never be interpreted by a shell");
  const vendoredRoot = fs.realpathSync(path.join(fixtureSite, ".cache", "skills-registry"));

  const cloneArgs = JSON.parse(fs.readFileSync(fakeGitLog, "utf8").trim().split("\n")[0]);
  assert.deepEqual(
    cloneArgs,
    ["clone", "--depth=1", remoteUrl, vendoredRoot],
    "clone must receive the complete registry URL as one argv value"
  );

  const pullResult = runBuild(remoteUrl);
  assert.equal(pullResult.status, 0, `${pullResult.stdout}\n${pullResult.stderr}`);
  const invocations = fs.readFileSync(fakeGitLog, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    invocations[1],
    ["-C", vendoredRoot, "pull", "--ff-only"],
    "pull must receive the vendored path as one argv value"
  );
  assert.equal(fs.existsSync(shellSentinel), false, "pull fallback must remain shell-free");

  console.log("Skills registry resolution PASS: clone/pull argv boundaries are shell-free and offline-tested");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
