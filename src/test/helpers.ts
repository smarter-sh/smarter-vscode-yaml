/** Test helpers: the bundled contract, and a validator that reads it. */
import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import { stringify } from "yaml";

import type { JsonSchema } from "../core/schema";
import { Problem, validateText } from "../core/validate";

export const SAM_DIR = path.resolve(__dirname, "../../contract/sam");

export const KINDS = readdirSync(SAM_DIR)
  .filter((file) => file.endsWith(".schema.json"))
  .map((file) => file.slice(0, -".schema.json".length))
  .sort();

export function schemaOf(kind: string): JsonSchema {
  return JSON.parse(
    readFileSync(path.join(SAM_DIR, `${kind}.schema.json`), "utf8"),
  );
}

export function exampleOf(kind: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(SAM_DIR, `${kind}.example.json`), "utf8"),
  );
}

export function exampleYaml(kind: string): string {
  return stringify(exampleOf(kind), { lineWidth: 0 });
}

export function schemaFor(kind: string): Promise<JsonSchema | undefined> {
  const canonical = KINDS.find((k) => k.toLowerCase() === kind.toLowerCase());
  return Promise.resolve(canonical ? schemaOf(canonical) : undefined);
}

export function validate(
  text: string,
  unknownKeys: Problem["severity"] | "off" = "warning",
): Promise<Problem[]> {
  return validateText(text, { schemaFor, kinds: KINDS, unknownKeys });
}

/** Return the text of a problem's span. */
export function spanText(text: string, problem: Problem): string {
  return text.slice(problem.span.start, problem.span.end);
}
