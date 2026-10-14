#!/usr/bin/env node
// Exercise the extension's api client (src/core/api.ts) and schema store against a real platform.
//
// usage, from the repository root, after `npm run compile-tests`:
//   SMARTER_API_KEY=<throwaway key> node skills/smarter-api-testing/scripts/probe-platform.js [--write]
//
// SMARTER_BASE_URL defaults to the local dev server, http://localhost:9357. Without --write it only
// reads: whoami, resources, every kind's live schema compared with the bundled one, an example
// manifest, and validate (which saves nothing). With --write it also applies a throwaway Secret,
// describes it, lists it, and deletes it. It never deploys: deploy creates real infrastructure.
"use strict";

const path = require("path");
const { isDeepStrictEqual } = require("util");

const root = path.resolve(__dirname, "../../..");
let core;
try {
  core = {
    ...require(path.join(root, "out/core/api.js")),
    ...require(path.join(root, "out/core/schemaStore.js")),
    ...require(path.join(root, "out/core/yamlDoc.js")),
    ...require(path.join(root, "out/core/validate.js")),
    ...require(path.join(root, "out/test/helpers.js")),
  };
} catch {
  console.error("Run `npm run compile-tests` first.");
  process.exit(2);
}

const rootUrl = process.env.SMARTER_BASE_URL || "http://localhost:9357";
const apiKey = process.env.SMARTER_API_KEY;
const write = process.argv.includes("--write");
if (!apiKey) {
  console.error(
    "Set SMARTER_API_KEY to a throwaway key (see the smarter-api-testing skill).",
  );
  process.exit(2);
}

const api = new core.SmarterApi({ rootUrl, apiKey, timeout: 30000 });
const publicApi = new core.SmarterApi({ rootUrl, timeout: 30000 });
let failures = 0;

async function check(name, run) {
  try {
    const result = await run();
    console.log(`ok    ${name}${result === undefined ? "" : `: ${result}`}`);
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL  ${name}: ${error && error.message ? error.message : error}`,
    );
  }
}

const NAME = `vscode_probe_${process.pid}`;
const SECRET = `apiVersion: smarter.sh/v1
kind: Secret
metadata:
  name: ${NAME}
  description: A throwaway secret from smarter-vscode-yaml's probe. DELETE ME
  version: 1.0.0
spec:
  config:
    value: not-a-real-secret
    expiration_date: 2099-01-31
`;

async function main() {
  console.log(`platform: ${rootUrl}${write ? " (with writes)" : ""}`);
  await check("whoami", async () => {
    const who = await api.whoami();
    return `user ${who.user.isSuperuser ? "(superuser)" : "(not a superuser)"}`;
  });
  await check("resources match the bundled kinds", async () => {
    const kinds = (await api.resources()).map((r) => r.APIKind).sort();
    const missing = kinds.filter((k) => !core.KINDS.includes(k));
    const extra = core.KINDS.filter((k) => !kinds.includes(k));
    if (missing.length || extra.length)
      throw new Error(`not bundled: ${missing}; not on the platform: ${extra}`);
    return `${kinds.length} kinds`;
  });
  await check("live schemas equal the bundled ones", async () => {
    const differ = [];
    for (const kind of core.KINDS) {
      if (
        !isDeepStrictEqual(
          await publicApi.jsonSchema(kind),
          core.schemaOf(kind),
        )
      )
        differ.push(kind);
    }
    if (differ.length)
      throw new Error(
        `differ (sync the contract, or the platform is another version): ${differ}`,
      );
    return `${core.KINDS.length} kinds`;
  });
  await check("the schema store reads from the platform", async () => {
    const store = new core.SchemaStore({
      bundledDir: core.SAM_DIR,
      source: () => "platform",
      api: () => publicApi,
    });
    await store.schema("Secret");
    if (store.origin("Secret") !== "platform")
      throw new Error(`origin ${store.origin("Secret")}`);
  });
  await check(
    "example manifest",
    async () => (await publicApi.exampleManifest("Guardrail")).kind,
  );
  await check("validate a valid manifest", async () => {
    const result = await api.validate(SECRET);
    if (!result.valid) throw new Error(JSON.stringify(result.errors));
  });
  await check(
    "validate an invalid manifest, and agree with the local validator",
    async () => {
      const bad = SECRET.replace("    value: not-a-real-secret\n", "");
      const remote = (await api.validate(bad)).errors.map((e) =>
        e.loc.join("."),
      );
      const local = (await core.validate(bad)).map((p) => p.path.join("."));
      if (!isDeepStrictEqual(remote.sort(), local.sort()))
        throw new Error(`platform ${remote}; local ${local}`);
      return remote.join(", ");
    },
  );
  await check("a bad key is a 401", async () => {
    try {
      await new core.SmarterApi({ rootUrl, apiKey: "x".repeat(64) }).whoami();
    } catch (error) {
      if (error.isUnauthorized) return error.status;
      throw error;
    }
    throw new Error("accepted");
  });
  if (!write) return;
  await check(
    `apply Secret ${NAME}`,
    async () => (await api.apply(SECRET)).message,
  );
  await check(
    "describe it",
    async () => (await api.describe("Secret", NAME)).metadata.name,
  );
  await check("get lists it", async () => {
    const listing = await api.get("Secret");
    if (!listing.data.items.some((item) => item.name === NAME))
      throw new Error("not listed");
  });
  await check(
    "delete it",
    async () => (await api.delete("Secret", NAME)).message,
  );
}

main()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(() => {
    console.log(failures ? `${failures} failed` : "all passed");
    process.exit(failures ? 1 : 0);
  });
