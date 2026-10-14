import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exampleYaml, KINDS, spanText, validate } from "./helpers";

const SECRET = `apiVersion: smarter.sh/v1
kind: Secret
metadata:
  name: example_secret
  description: an example secret
  version: 1.0.0
spec:
  config:
    value: sk-xxxx
    expiration_date: "2027-04-13T00:00:00Z"
`;

describe("validateText", () => {
  it("bundles every kind of the platform", () => {
    assert.ok(KINDS.length >= 25, `only ${KINDS.length} kinds`);
    for (const kind of [
      "LLMClient",
      "Secret",
      "Guardrail",
      "CustomDomain",
      "SqlPlugin",
    ]) {
      assert.ok(KINDS.includes(kind), kind);
    }
  });

  for (const kind of KINDS) {
    it(`finds no problem in the platform's ${kind} example`, async () => {
      const problems = await validate(exampleYaml(kind));
      assert.deepEqual(
        problems.map((p) => `${p.code}: ${p.message}`),
        [],
      );
    });
  }

  it("ignores YAML that isn't a Smarter manifest", async () => {
    assert.deepEqual(
      await validate("apiVersion: apps/v1\nkind: Deployment\nfoo: [\n"),
      [],
    );
  });

  it("reports a YAML syntax error of a manifest at its position", async () => {
    const text = "apiVersion: smarter.sh/v1\nkind: Secret\nmetadata: [\n";
    const problems = await validate(text);
    assert.equal(problems[0].code, "yaml-syntax");
    assert.ok(problems[0].span.start >= text.indexOf("metadata"));
  });

  it("reports an unknown kind, with a suggestion", async () => {
    const text = SECRET.replace("kind: Secret", "kind: Secrett");
    const [problem] = await validate(text);
    assert.equal(problem.code, "unknown-kind");
    assert.match(problem.message, /Did you mean 'Secret'/);
    assert.equal(spanText(text, problem), "Secrett");
    assert.deepEqual(problem.data, { fix: "set-kind", replacement: "Secret" });
  });

  it("accepts a kind in any case, as the platform does", async () => {
    assert.deepEqual(
      await validate(SECRET.replace("kind: Secret", "kind: secret")),
      [],
    );
  });

  it("reports a missing kind", async () => {
    const [problem] = await validate(SECRET.replace("kind: Secret\n", ""));
    assert.equal(problem.code, "missing-kind");
  });

  it("reports a wrong type at the value, once, for an optional field", async () => {
    const text = SECRET.replace(
      "description: an example secret",
      "description: [1, 2]",
    );
    const problems = (await validate(text)).filter((p) =>
      p.code.startsWith("schema-"),
    );
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.equal(spanText(text, problems[0]), "[1, 2]");
    assert.match(
      problems[0].message,
      /^metadata\.description: Must be string or null\.$/,
    );
  });

  it("reports a missing required key at its parent, with where to add it", async () => {
    const text = SECRET.replace("  version: 1.0.0\n", "");
    const [problem] = (await validate(text)).filter(
      (p) => p.code === "missing-key",
    );
    assert.equal(spanText(text, problem), "metadata");
    assert.match(problem.message, /'version' in metadata/);
    assert.equal(problem.data?.fix, "add-key");
    if (problem.data?.fix !== "add-key") return;
    assert.equal(problem.data.indent, 2);
    // after metadata's last line
    assert.equal(
      text.slice(0, problem.data.after).split("\n").pop(),
      "  description: an example secret",
    );
  });

  it("reports a misspelled key, with a suggestion", async () => {
    const text = SECRET.replace("  description:", "  descripton:");
    const problems = await validate(text);
    const unknown = problems.find((p) => p.code === "unknown-key");
    assert.ok(unknown, JSON.stringify(problems));
    assert.equal(spanText(text, unknown), "descripton");
    assert.equal(unknown.severity, "warning");
    assert.deepEqual(unknown.data, {
      fix: "rename-key",
      replacement: "description",
    });
  });

  it("doesn't report unknown keys when they are off", async () => {
    const text = SECRET.replace("spec:\n", "colour: red\nspec:\n");
    assert.ok((await validate(text)).some((p) => p.code === "unknown-key"));
    assert.ok(
      !(await validate(text, "off")).some((p) => p.code === "unknown-key"),
    );
  });

  it("doesn't report the keys of a free-form mapping, e.g. annotations", async () => {
    const text = SECRET.replace(
      "metadata:\n",
      "metadata:\n  annotations:\n    - smarter.sh/anything: goes\n",
    );
    assert.deepEqual(await validate(text), []);
  });

  it("validates each manifest of a multi-document file", async () => {
    const text = `${SECRET}---\n${SECRET.replace("kind: Secret", "kind: Nope")}`;
    const problems = await validate(text);
    assert.equal(problems.length, 1);
    assert.ok(problems[0].span.start > text.indexOf("---"));
  });

  it("reports an enum value that isn't allowed, with the choices", async () => {
    const text = exampleYaml("Budget");
    const match = /^(\s+)period: (\w+)$/m.exec(text);
    assert.ok(match, "the Budget example has a period");
    const broken = text.replace(match[0], `${match[1]}period: fortnight`);
    const problems = await validate(broken);
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.equal(problems[0].code, "schema-enum");
    assert.equal(spanText(broken, problems[0]), "fortnight");
    assert.match(
      problems[0].message,
      /Must be one of: "hour", "day", "week", "month"/,
    );
    assert.deepEqual(problems[0].data, {
      fix: "replace-value",
      choices: ["hour", "day", "week", "month"],
    });
  });
});

describe("platform parity", () => {
  it("accepts a date for a date-time, as Pydantic does", async () => {
    for (const value of [
      '"2026-12-31"',
      "2026-12-31",
      '"2026-12-31 10:00"',
      '"2026-12-31T10:00:00+02:00"',
    ]) {
      const text = SECRET.replace('"2027-04-13T00:00:00Z"', value);
      assert.deepEqual(await validate(text), [], value);
    }
    const bad = SECRET.replace('"2027-04-13T00:00:00Z"', '"next tuesday"');
    assert.match(
      (await validate(bad))[0].message,
      /^spec\.config\.expiration_date: Must match format "date-time"\.$/,
    );
  });

  it("reads a zero-padded number as a string, as PyYAML does", async () => {
    const text = exampleYaml("Account").replace(
      /^(\s+)postalCode: .*$/m,
      "$1postalCode: 02139",
    );
    assert.deepEqual(await validate(text), []);
  });
});
