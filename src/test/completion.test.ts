import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hoverMarkdown,
  keySuggestions,
  scalarText,
  valueSuggestions,
} from "../core/completion";
import { isClosedMapping } from "../core/schema";
import {
  completionContext,
  keysAtPath,
  parseManifests,
  spansAtPath,
  targetAtOffset,
} from "../core/yamlDoc";
import { exampleYaml, KINDS, schemaOf } from "./helpers";

/** Return a text without its "|" cursor marker, and the cursor's offset. */
function cursor(textWithCursor: string): [string, number] {
  const offset = textWithCursor.indexOf("|");
  return [
    textWithCursor.slice(0, offset) + textWithCursor.slice(offset + 1),
    offset,
  ];
}

const HEAD = "apiVersion: smarter.sh/v1\nkind: Budget\n";

describe("completionContext", () => {
  it("completes a top-level key", () => {
    const [text, offset] = cursor(`${HEAD}me|`);
    assert.deepEqual(completionContext(text, offset), {
      position: "key",
      parentPath: [],
      prefix: "me",
      indent: 0,
    });
  });

  it("completes a nested key on an empty line, from its indentation", () => {
    const [text, offset] = cursor(
      `${HEAD}spec:\n  config:\n    action: block\n    |\n`,
    );
    const context = completionContext(text, offset);
    assert.deepEqual(context, {
      position: "key",
      parentPath: ["spec", "config"],
      prefix: "",
      indent: 4,
    });
  });

  it("completes a half-typed key, which YAML would read as a value", () => {
    const [text, offset] = cursor(`${HEAD}spec:\n  config:\n    per|\n`);
    assert.deepEqual(completionContext(text, offset), {
      position: "key",
      parentPath: ["spec", "config"],
      prefix: "per",
      indent: 4,
    });
  });

  it("completes the key of a sequence item", () => {
    const [text, offset] = cursor(`${HEAD}spec:\n  resources:\n    - |\n`);
    const context = completionContext(text, offset);
    assert.equal(context?.position, "key");
    if (context?.position === "key")
      assert.deepEqual(context.parentPath, ["spec", "resources", 0]);
  });

  it("completes a value", () => {
    const [text, offset] = cursor(`${HEAD}spec:\n  config:\n    period: mo|\n`);
    assert.deepEqual(completionContext(text, offset), {
      position: "value",
      path: ["spec", "config", "period"],
      prefix: "mo",
    });
  });

  it("completes the kind", () => {
    const [text, offset] = cursor("apiVersion: smarter.sh/v1\nkind: |");
    assert.deepEqual(completionContext(text, offset), {
      position: "value",
      path: ["kind"],
      prefix: "",
    });
  });
});

describe("suggestions", () => {
  const budget = schemaOf("Budget");

  it("suggests the keys of a mapping that it doesn't have yet, required first", () => {
    const labels = keySuggestions(budget, [], ["apiVersion", "kind"]).map(
      (s) => s.label,
    );
    assert.deepEqual(labels.slice(0, 2).sort(), ["metadata", "spec"]);
    assert.ok(!labels.includes("status"), "status is read only");
    assert.ok(!labels.includes("kind"));
  });

  it("inserts an enum's choices as a snippet choice", () => {
    const period = keySuggestions(budget, ["spec", "config"], []).find(
      (s) => s.label === "period",
    );
    assert.equal(period?.insertText, "period: ${1|hour,day,week,month|}");
  });

  it("opens a nested mapping on the next line", () => {
    const config = keySuggestions(budget, ["spec"], []).find(
      (s) => s.label === "config",
    );
    assert.equal(config?.insertText, "config:\n  $0");
  });

  it("suggests an enum's values", () => {
    const values = valueSuggestions(
      budget,
      ["spec", "config", "period"],
      KINDS,
    ).map((s) => s.label);
    assert.deepEqual(values, ["hour", "day", "week", "month"]);
  });

  it("suggests the kinds, and the api version", () => {
    assert.deepEqual(
      valueSuggestions(undefined, ["kind"], KINDS).map((s) => s.label),
      KINDS,
    );
    assert.deepEqual(
      valueSuggestions(undefined, ["apiVersion"], KINDS).map((s) => s.label),
      ["smarter.sh/v1"],
    );
  });

  it("suggests apiVersion and kind before the kind is known", () => {
    assert.deepEqual(
      keySuggestions(undefined, [], []).map((s) => s.label),
      ["apiVersion", "kind"],
    );
  });

  it("documents a key on hover, from its schema", () => {
    const markdown = hoverMarkdown(budget, ["spec", "config", "period"]);
    assert.ok(
      markdown?.startsWith('**period**: `"hour" | "day" | "week" | "month"`'),
      markdown,
    );
    assert.match(markdown ?? "", /`spec\.config\.period`/);
  });

  it("documents every key of every example", () => {
    for (const kind of KINDS) {
      const text = exampleYaml(kind);
      const [manifest] = parseManifests(text);
      const schema = schemaOf(kind);
      for (const match of text.matchAll(/^\s*(?:- )?([A-Za-z_][\w]*):/gm)) {
        const offset = (match.index ?? 0) + match[0].indexOf(match[1]);
        const target = targetAtOffset(manifest.doc, offset);
        assert.ok(target, `${kind}: ${match[1]}`);
        // text that looks like a key inside a block scalar, e.g. a skill's markdown, is a value.
        if (!target.isKey) continue;
        // the keys of a free-form mapping, e.g. annotations, have no documentation.
        if (!isClosedMapping(schema, target.path.slice(0, -1))) continue;
        assert.ok(
          hoverMarkdown(schema, target.path),
          `${kind}: no hover for ${target.path.join(".")}`,
        );
      }
    }
  });

  it("quotes a scalar that YAML would read as another type", () => {
    assert.equal(scalarText("month"), "month");
    assert.equal(scalarText("yes"), '"yes"');
    assert.equal(scalarText("1.0"), '"1.0"');
    assert.equal(scalarText("a: b"), '"a: b"');
    assert.equal(scalarText(true), "true");
  });
});

describe("yamlDoc", () => {
  it("finds the spans of a path, or of its nearest ancestor", () => {
    const text = `${HEAD}spec:\n  config:\n    period: month\n`;
    const [manifest] = parseManifests(text);
    const found = spansAtPath(manifest.doc, ["spec", "config", "period"]);
    assert.equal(text.slice(found.key!.start, found.key!.end), "period");
    assert.equal(text.slice(found.value!.start, found.value!.end), "month");
    const missing = spansAtPath(manifest.doc, ["spec", "config", "unit"]);
    assert.equal(missing.depth, 2);
    assert.equal(text.slice(missing.key!.start, missing.key!.end), "config");
  });

  it("lists a mapping's keys", () => {
    const [manifest] = parseManifests(
      `${HEAD}spec:\n  config:\n    period: month\n    unit: cost\n`,
    );
    assert.deepEqual(keysAtPath(manifest.doc, ["spec", "config"]), [
      "period",
      "unit",
    ]);
  });

  it("recognizes a broken manifest from its apiVersion line", () => {
    const [manifest] = parseManifests("apiVersion: smarter.sh/v1\nkind: [\n");
    assert.equal(manifest.isManifest, true);
    const [other] = parseManifests("apiVersion: v1\nkind: Pod\n");
    assert.equal(other.isManifest, false);
  });
});
