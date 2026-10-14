import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { SmarterApi, SmarterApiError } from "../core/api";
import { cliEnvironment, readCliApiKey } from "../core/cliConfig";
import { docsUrl } from "../core/docs";
import { SchemaStore } from "../core/schemaStore";
import { closest } from "../core/strings";
import { KINDS, SAM_DIR } from "./helpers";

type Call = { url: string; init: RequestInit };

function fakeFetch(
  status: number,
  body: unknown,
  calls: Call[] = [],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("SmarterApi", () => {
  it("POSTs to the cli api with the api key", async () => {
    const calls: Call[] = [];
    const api = new SmarterApi({
      rootUrl: "https://example.com/",
      apiKey: "abc",
      fetch: fakeFetch(
        200,
        {
          api: "smarter.sh/v1",
          data: { valid: true, errors: [] },
          metadata: {},
        },
        calls,
      ),
    });
    const result = await api.validate({ kind: "Secret" });
    assert.deepEqual(result, { valid: true, errors: [] });
    assert.equal(calls[0].url, "https://example.com/api/v1/cli/validate/");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(
      (calls[0].init.headers as Record<string, string>).Authorization,
      "Token abc",
    );
    assert.equal(calls[0].init.body, JSON.stringify({ kind: "Secret" }));
  });

  it("sends a YAML manifest as YAML, for the platform to parse as the cli's", async () => {
    const calls: Call[] = [];
    const api = new SmarterApi({
      rootUrl: "https://example.com",
      fetch: fakeFetch(200, { data: { valid: true, errors: [] } }, calls),
    });
    await api.validate("apiVersion: smarter.sh/v1\nkind: Secret\n");
    assert.equal(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
      "application/x-yaml",
    );
    assert.equal(
      calls[0].init.body,
      "apiVersion: smarter.sh/v1\nkind: Secret\n",
    );
  });

  it("passes a resource's name as a query parameter", () => {
    const api = new SmarterApi({ rootUrl: "https://example.com" });
    assert.equal(
      api.cliUrl("describe", "Secret", { name: "a b" }),
      "https://example.com/api/v1/cli/describe/Secret/?name=a+b",
    );
  });

  it("raises the journal's error description", async () => {
    const api = new SmarterApi({
      rootUrl: "https://example.com",
      fetch: fakeFetch(403, {
        error: { description: "Not allowed.", errorClass: "X" },
      }),
    });
    await assert.rejects(api.whoami(), (error: unknown) => {
      assert.ok(error instanceof SmarterApiError);
      assert.equal(error.message, "Not allowed.");
      assert.equal(error.isUnauthorized, true);
      return true;
    });
  });

  it("raises a network failure as status 0", async () => {
    const api = new SmarterApi({
      rootUrl: "https://example.com",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await assert.rejects(
      api.version(),
      (error: unknown) =>
        error instanceof SmarterApiError && error.status === 0,
    );
  });
});

describe("SchemaStore", () => {
  const store = (
    api: SmarterApi,
    source: "platform" | "bundled" = "platform",
  ) =>
    new SchemaStore({
      bundledDir: SAM_DIR,
      source: () => source,
      api: () => api,
    });

  it("lists the bundled kinds, and matches a kind in any case", async () => {
    const schemas = store(
      new SmarterApi({ rootUrl: "https://example.com" }),
      "bundled",
    );
    assert.deepEqual(await schemas.kinds(), KINDS);
    assert.equal(await schemas.canonicalKind("llmclient"), "LLMClient");
    assert.ok((await schemas.example("Secret"))?.spec);
  });

  it("reads a schema from the platform, once", async () => {
    const calls: Call[] = [];
    const schema = { properties: { kind: { type: "string" } } };
    const schemas = store(
      new SmarterApi({
        rootUrl: "https://example.com",
        fetch: fakeFetch(200, { data: schema }, calls),
      }),
    );
    assert.deepEqual(await schemas.schema("Secret"), schema);
    assert.deepEqual(await schemas.schema("secret"), schema);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://example.com/api/v1/cli/json-schema/Secret/",
    );
    assert.equal(schemas.origin("Secret"), "platform");
  });

  it("falls back to the bundled schema, and doesn't retry a failed platform right away", async () => {
    const calls: Call[] = [];
    const schemas = store(
      new SmarterApi({
        rootUrl: "https://example.com",
        fetch: fakeFetch(500, {}, calls),
      }),
    );
    assert.ok((await schemas.schema("Secret"))?.properties);
    assert.ok((await schemas.schema("Secret"))?.properties);
    assert.equal(calls.length, 1);
    assert.equal(schemas.origin("Secret"), "bundled");
  });

  it("doesn't call the platform with the bundled source", async () => {
    const calls: Call[] = [];
    const schemas = store(
      new SmarterApi({
        rootUrl: "https://example.com",
        fetch: fakeFetch(200, {}, calls),
      }),
      "bundled",
    );
    assert.ok(await schemas.schema("Guardrail"));
    assert.equal(await schemas.schema("NoSuchKind"), undefined);
    assert.equal(calls.length, 0);
  });
});

describe("cli config", () => {
  it("maps a platform url to the cli's environment", () => {
    assert.equal(cliEnvironment("http://localhost:9357"), "local");
    assert.equal(cliEnvironment("https://alpha.ubc.smarter.sh"), "alpha");
    assert.equal(cliEnvironment("https://beta.example.com"), "beta");
    assert.equal(cliEnvironment("https://ubc.smarter.sh"), "prod");
    assert.equal(cliEnvironment("not a url"), "prod");
  });

  it("reads the environment's api key from the cli's config file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "smarter-cli-"));
    const file = path.join(dir, "config.yaml");
    writeFileSync(
      file,
      "config:\n  environment: prod\nlocal:\n  api_key: local-key\nprod:\n  api_key: ''\n",
    );
    assert.equal(
      await readCliApiKey("http://localhost:9357", file),
      "local-key",
    );
    assert.equal(
      await readCliApiKey("https://ubc.smarter.sh", file),
      undefined,
    );
    assert.equal(
      await readCliApiKey(
        "https://ubc.smarter.sh",
        path.join(dir, "missing.yaml"),
      ),
      undefined,
    );
  });
});

describe("helpers", () => {
  it("suggests the closest word, only when it is close", () => {
    assert.equal(closest("descripton", ["description", "name"]), "description");
    assert.equal(closest("LLMclient", KINDS), "LLMClient");
    assert.equal(closest("zzz", ["description", "name"]), undefined);
  });

  it("links every kind to a documentation page", () => {
    for (const kind of KINDS)
      assert.match(
        docsUrl(kind),
        /\/smarter-resources\/smarter-[\w-]+\.html$/,
        kind,
      );
    assert.match(docsUrl("Unknown"), /search\.html\?q=Unknown$/);
  });
});

describe("contract", () => {
  it("bundles a schema and an example of every kind in the OpenAPI document", () => {
    const openapi = JSON.parse(readFileSync(path.resolve(SAM_DIR, "../openapi.json"), "utf8"));
    const kinds = [...openapi.components.schemas.SAMKind.enum].sort();
    assert.deepEqual(KINDS, kinds, "run scripts/sync-contracts.sh");
    for (const kind of kinds) {
      assert.ok(existsSync(path.join(SAM_DIR, `${kind}.example.json`)), kind);
    }
  });
});
