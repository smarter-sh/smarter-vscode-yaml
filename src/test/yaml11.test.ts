import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseManifests } from "../core/yamlDoc";

/** What PyYAML's safe_load, which the platform uses, makes of each plain scalar. */
const PYYAML: Record<string, unknown> = {
  "02139": "02139",
  "2026-06-05": "2026-06-05",
  yes: true,
  y: "y",
  n: "n",
  No: false,
  on: true,
  "0o17": "0o17",
  "017": 15,
  "1_000": 1000,
  "1e5": "1e5",
  "1.0e+5": 100000,
  "1.5": 1.5,
  ".5": 0.5,
  "0x1F": 31,
  "0b101": 5,
  "190:20:30": 685230,
  "~": null,
  null: null,
  "12:30": 750,
  "0": 0,
  "+12": 12,
  "1.": 1,
  "3.0e5": "3.0e5",
};

describe("YAML 1.1 scalars", () => {
  for (const [text, expected] of Object.entries(PYYAML)) {
    it(`reads ${text} as PyYAML does`, () => {
      const [doc] = parseManifests(`a: ${text}\n`);
      assert.deepEqual((doc.value as { a: unknown }).a, expected);
    });
  }
});
