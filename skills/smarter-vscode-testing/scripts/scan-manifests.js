#!/usr/bin/env node
// Validate every Smarter manifest (apiVersion: smarter.sh/v1) under some folders with the
// extension's validator and the bundled schemas, and print each problem, to find false positives.
//
// usage, from the repository root, after `npm run compile-tests`:
//   node skills/smarter-vscode-testing/scripts/scan-manifests.js [folder ...]
//
// The default folders are the Smarter repositories beside this one: ../smarter (its built-in data,
// test fixtures and docs examples), ../examples and ../smarter-python/tests/data. Prints one line per
// problem, `file: [severity] code message`, then a count per code on stderr. Read-only.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../../..");
const helpers = path.join(root, "out/test/helpers.js");
if (!fs.existsSync(helpers)) {
  console.error("Run `npm run compile-tests` first.");
  process.exit(2);
}
const { validate } = require(helpers);

const SKIP = new Set([
  "node_modules",
  ".git",
  "venv",
  ".venv",
  "staticfiles",
  "dist",
  "build",
  ".vscode-test",
]);
const MANIFEST = /^apiVersion:\s*["']?smarter\.sh\/v1/m;

function* yamlFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* yamlFiles(full);
    else if (/\.ya?ml$/.test(entry.name)) yield full;
  }
}

async function main() {
  const parent = path.dirname(root);
  const folders =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ["smarter", "examples", "smarter-python/tests/data"].map((f) =>
          path.join(parent, f),
        );
  const counts = {};
  let files = 0;
  for (const folder of folders) {
    for (const file of yamlFiles(folder)) {
      const text = fs.readFileSync(file, "utf8");
      if (!MANIFEST.test(text)) continue;
      files += 1;
      for (const problem of await validate(text)) {
        counts[problem.code] = (counts[problem.code] || 0) + 1;
        console.log(
          `${path.relative(parent, file)}: [${problem.severity}] ${problem.code} ${problem.message}`,
        );
      }
    }
  }
  console.error(
    `${files} manifests; problems by code: ${JSON.stringify(counts)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
