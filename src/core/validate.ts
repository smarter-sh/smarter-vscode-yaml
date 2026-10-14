/**
 * Validate the Smarter manifests of a YAML text against their kinds' JSON Schemas, and report
 * each problem at the exact key or value it is about. Nothing here depends on VS Code.
 */
import Ajv2020, { ErrorObject, ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { Document, isMap, Node } from "yaml";

import { closest } from "./strings";
import { isClosedMapping, JsonSchema, propertiesAtPath } from "./schema";
import {
  isRecord,
  parseManifests,
  PathSegment,
  Span,
  spansAtPath,
  SMARTER_API_VERSION,
} from "./yamlDoc";

export type Severity = "error" | "warning" | "information";

/** What a quick fix needs to know about a problem. */
export type ProblemData =
  | { fix: "rename-key"; replacement: string }
  | { fix: "replace-value"; choices: unknown[] }
  | { fix: "add-key"; key: string; indent: number; after: number }
  | { fix: "set-kind"; replacement: string };

export type Problem = {
  span: Span;
  message: string;
  severity: Severity;
  /** A stable code, e.g. "unknown-key", shown with the message and used by quick fixes. */
  code: string;
  /** The path of the value that the problem is about. */
  path: PathSegment[];
  data?: ProblemData;
};

export type ValidateOptions = {
  /** Return a kind's schema, or undefined if the kind is unknown. */
  schemaFor: (kind: string) => Promise<JsonSchema | undefined>;
  /** The kinds that exist, for "did you mean". */
  kinds: string[];
  /** How to report a key that the schema doesn't declare. */
  unknownKeys: Severity | "off";
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  logger: false,
  validateFormats: true,
});
addFormats(ajv);
// Pydantic's datetime also accepts a date, a space for the T, and minutes without seconds.
ajv.addFormat(
  "date-time",
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/,
);
const compiled = new WeakMap<JsonSchema, ValidateFunction>();

function compile(schema: JsonSchema): ValidateFunction {
  let validate = compiled.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    compiled.set(schema, validate);
  }
  return validate;
}

/** Return the problems of every Smarter manifest in a YAML text. */
export async function validateText(
  text: string,
  options: ValidateOptions,
): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const manifest of parseManifests(text)) {
    if (!manifest.isManifest) continue;
    // YAML errors and warnings
    for (const error of manifest.doc.errors) {
      problems.push({
        span: {
          start: error.pos[0],
          end: Math.max(error.pos[1], error.pos[0] + 1),
        },
        message: firstLine(error.message),
        severity: "error",
        code: "yaml-syntax",
        path: [],
      });
    }
    for (const warning of manifest.doc.warnings) {
      problems.push({
        span: {
          start: warning.pos[0],
          end: Math.max(warning.pos[1], warning.pos[0] + 1),
        },
        message: firstLine(warning.message),
        severity: "warning",
        code: "yaml-warning",
        path: [],
      });
    }
    if (manifest.doc.errors.length) continue;
    problems.push(
      ...(await validateManifest(manifest.doc, text, manifest.value, options)),
    );
  }
  return problems;
}

function firstLine(message: string): string {
  return message.split("\n")[0];
}

async function validateManifest(
  doc: Document.Parsed,
  text: string,
  value: unknown,
  options: ValidateOptions,
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const at = (path: PathSegment[], preferKey = true): Span =>
    spanOf(doc, path, preferKey);

  if (!isRecord(value)) {
    return [
      {
        span: at([]),
        message: "A manifest must be a YAML mapping.",
        severity: "error",
        code: "not-a-mapping",
        path: [],
      },
    ];
  }
  if (value.apiVersion !== SMARTER_API_VERSION) {
    problems.push({
      span: at(["apiVersion"], false),
      message: `apiVersion must be ${SMARTER_API_VERSION}.`,
      severity: "error",
      code: "api-version",
      path: ["apiVersion"],
    });
  }
  const kind = value.kind;
  if (typeof kind !== "string" || !kind) {
    problems.push({
      span: "kind" in value ? at(["kind"], false) : at(["apiVersion"]),
      message: `Missing kind. A manifest's kind is one of: ${options.kinds.join(", ")}.`,
      severity: "error",
      code: "missing-kind",
      path: ["kind"],
    });
    return problems;
  }
  const schema = await options.schemaFor(kind);
  if (!schema) {
    const suggestion = closest(kind, options.kinds);
    problems.push({
      span: at(["kind"], false),
      message: suggestion
        ? `Unknown kind '${kind}'. Did you mean '${suggestion}'?`
        : `Unknown kind '${kind}'. A manifest's kind is one of: ${options.kinds.join(", ")}.`,
      severity: "error",
      code: "unknown-kind",
      path: ["kind"],
      data: suggestion
        ? { fix: "set-kind", replacement: suggestion }
        : undefined,
    });
    return problems;
  }

  const validate = compile(schema);
  if (!validate(value))
    problems.push(...schemaProblems(doc, text, validate.errors ?? []));
  if (options.unknownKeys !== "off")
    problems.push(
      ...unknownKeyProblems(doc, value, schema, options.unknownKeys),
    );
  return problems;
}

/** Return the span of a path's key, or of its value, or of its nearest ancestor that is in the text. */
export function spanOf(
  doc: Document.Parsed,
  path: PathSegment[],
  preferKey = true,
): Span {
  const spans = spansAtPath(doc, path);
  const found = spans.depth === path.length;
  const span =
    found && !preferKey
      ? (spans.value ?? spans.key)
      : (spans.key ?? spans.value);
  if (span && span.end > span.start) return span;
  if (spans.key) return spans.key;
  return { start: doc.range[0], end: doc.range[0] + 1 };
}

function pathOf(instancePath: string): PathSegment[] {
  if (!instancePath) return [];
  return instancePath
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/**
 * Turn Ajv's errors into one problem per invalid value. An optional field is an `anyOf` of its type
 * and null, so one wrong value produces an error per alternative, and one for the `anyOf`: report
 * them as one, e.g. "must be integer or null".
 */
function schemaProblems(
  doc: Document.Parsed,
  text: string,
  errors: ErrorObject[],
): Problem[] {
  const problems: Problem[] = [];
  const byPath = new Map<string, ErrorObject[]>();
  for (const error of errors) {
    const list = byPath.get(error.instancePath) ?? [];
    list.push(error);
    byPath.set(error.instancePath, list);
  }
  for (const [instancePath, list] of byPath) {
    const path = pathOf(instancePath);
    const required = list.filter((e) => e.keyword === "required");
    for (const error of required) {
      const missing = String(error.params.missingProperty);
      const spans = spansAtPath(doc, path);
      problems.push({
        span: spanOf(doc, path),
        message: path.length
          ? `Missing required key '${missing}' in ${path.join(".")}.`
          : `Missing required key '${missing}'.`,
        severity: "error",
        code: "missing-key",
        path: [...path, missing],
        data:
          spans.depth === path.length
            ? addKeyData(doc, text, path, missing)
            : undefined,
      });
    }
    const rest = list.filter((e) => e.keyword !== "required");
    if (!rest.length) continue;
    const enumError = rest.find(
      (e) => e.keyword === "enum" || e.keyword === "const",
    );
    const types = [
      ...new Set(
        rest
          .filter((e) => e.keyword === "type")
          .flatMap((e) => String(e.params.type).split(",")),
      ),
    ];
    let message: string;
    let data: ProblemData | undefined;
    if (enumError) {
      const choices = (enumError.params.allowedValues as
        | unknown[]
        | undefined) ?? [enumError.params.allowedValue];
      message = `Must be one of: ${choices.map((c) => JSON.stringify(c)).join(", ")}.`;
      data = { fix: "replace-value", choices };
    } else if (
      types.length &&
      rest.every((e) => ["type", "anyOf", "oneOf"].includes(e.keyword))
    ) {
      message = `Must be ${types.join(" or ")}.`;
    } else {
      // an optional field's "must be null" says nothing about the value's real problem.
      const specific = rest.filter(
        (e) =>
          !["anyOf", "oneOf", "if", "then", "else"].includes(e.keyword) &&
          !(e.keyword === "type" && e.params.type === "null"),
      );
      const chosen = specific.length ? specific : rest;
      message = [...new Set(chosen.map((e) => describeError(e)))].join(" ");
    }
    const label = path.length ? `${path.join(".")}: ` : "";
    problems.push({
      span: spanOf(doc, path, false),
      message: `${label}${message}`,
      severity: "error",
      code: `schema-${(enumError ?? rest[0]).keyword}`,
      path,
      data,
    });
  }
  return problems;
}

function describeError(error: ErrorObject): string {
  const message = error.message ?? "is invalid";
  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

/**
 * Where to insert a missing key: at the end of the mapping's last line, at the indentation of its
 * first key. Undefined for a mapping that isn't a block mapping with keys, e.g. `{}`.
 */
function addKeyData(
  doc: Document.Parsed,
  text: string,
  path: PathSegment[],
  key: string,
): ProblemData | undefined {
  const node = path.length ? doc.getIn(path, true) : doc.contents;
  if (!isMap(node) || node.flow || !node.items.length) return undefined;
  const firstKey = (node.items[0].key as Node | null)?.range;
  const last = node.items[node.items.length - 1];
  const lastEnd = ((last.value as Node | null)?.range ??
    (last.key as Node | null)?.range)?.[1];
  if (!firstKey || lastEnd === undefined) return undefined;
  const indent = firstKey[0] - (text.lastIndexOf("\n", firstKey[0] - 1) + 1);
  const lineEnd = text.indexOf("\n", Math.max(lastEnd - 1, 0));
  return {
    fix: "add-key",
    key,
    indent,
    after: lineEnd === -1 ? text.length : lineEnd,
  };
}

/** Return a problem for each key that a closed mapping's schema doesn't declare. */
function unknownKeyProblems(
  doc: Document.Parsed,
  value: Record<string, unknown>,
  schema: JsonSchema,
  severity: Severity,
): Problem[] {
  const problems: Problem[] = [];
  const visit = (node: unknown, path: PathSegment[]) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, [...path, i]));
      return;
    }
    if (!isRecord(node)) return;
    const closed = isClosedMapping(schema, path);
    const declared = closed
      ? propertiesAtPath(schema, path).map((p) => p.name)
      : [];
    for (const [key, child] of Object.entries(node)) {
      if (closed && !declared.includes(key)) {
        const suggestion = closest(key, declared);
        const where = path.length ? ` in ${path.join(".")}` : "";
        problems.push({
          span: spanOf(doc, [...path, key]),
          message: suggestion
            ? `Unknown key '${key}'${where}. Did you mean '${suggestion}'?`
            : `Unknown key '${key}'${where}. Expected one of: ${declared.join(", ")}.`,
          severity,
          code: "unknown-key",
          path: [...path, key],
          data: suggestion
            ? { fix: "rename-key", replacement: suggestion }
            : undefined,
        });
        continue;
      }
      visit(child, [...path, key]);
    }
  };
  visit(value, []);
  return problems;
}
