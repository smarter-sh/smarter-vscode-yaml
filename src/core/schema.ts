/**
 * Navigate a SAM kind's JSON Schema, as Pydantic generates it (JSON Schema 2020-12): local
 * `$ref`s into `$defs`, and `anyOf` for unions, e.g. `anyOf: [{type: string}, {type: null}]` for an
 * optional field.
 */
import type { PathSegment } from "./yamlDoc";

export type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | false;
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  readOnly?: boolean;
  deprecated?: boolean;
  [key: string]: unknown;
};

/** Resolve a local `$ref` (`#/$defs/Name`, or any `#/...` pointer) against the root schema. */
export function resolveRef(root: JsonSchema, schema: JsonSchema): JsonSchema {
  let current = schema;
  const seen = new Set<string>();
  while (
    current.$ref &&
    current.$ref.startsWith("#/") &&
    !seen.has(current.$ref)
  ) {
    seen.add(current.$ref);
    let target: unknown = root;
    for (const part of current.$ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      target = (target as Record<string, unknown> | undefined)?.[key];
    }
    if (!target || typeof target !== "object") break;
    // keep the referring schema's own description and default, which Pydantic puts beside the $ref.
    const { $ref: _ref, ...rest } = current;
    current = { ...(target as JsonSchema), ...rest };
  }
  return current;
}

/**
 * Return the alternatives of a schema: itself, or the members of its `anyOf` and `oneOf`, with
 * `$ref`s resolved, `allOf`s merged, and the `null` alternative of an optional field dropped.
 */
export function alternatives(
  root: JsonSchema,
  schema: JsonSchema | undefined,
): JsonSchema[] {
  if (!schema) return [];
  const resolved = resolveRef(root, schema);
  const union = resolved.anyOf ?? resolved.oneOf;
  if (union) {
    const { anyOf: _a, oneOf: _o, ...outer } = resolved;
    const members = union
      .flatMap((member) => alternatives(root, member))
      .filter((member) => member.type !== "null");
    // the outer schema's description applies to every member that has none.
    return members.map((member) => ({
      ...outer,
      ...member,
      description: member.description ?? outer.description,
    }));
  }
  if (resolved.allOf) {
    const { allOf, ...outer } = resolved;
    return [
      allOf.reduce<JsonSchema>(
        (merged, part) => mergeSchemas(merged, resolveRef(root, part)),
        outer,
      ),
    ];
  }
  return [resolved];
}

function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  return {
    ...a,
    ...b,
    properties: { ...(a.properties ?? {}), ...(b.properties ?? {}) },
    required: [...(a.required ?? []), ...(b.required ?? [])],
  };
}

function typesOf(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return schema.type;
  if (schema.type) return [schema.type];
  if (schema.properties) return ["object"];
  if (schema.items) return ["array"];
  return [];
}

/** Return whether a schema accepts an object. */
export function isObjectSchema(schema: JsonSchema): boolean {
  const types = typesOf(schema);
  return types.includes("object") || (!types.length && !!schema.properties);
}

/** Return whether a schema accepts an array. */
export function isArraySchema(schema: JsonSchema): boolean {
  return typesOf(schema).includes("array");
}

/** Return the schemas that a path's value may have, following properties and items. */
export function schemasAtPath(
  root: JsonSchema,
  path: PathSegment[],
): JsonSchema[] {
  let current = alternatives(root, root);
  for (const segment of path) {
    const next: JsonSchema[] = [];
    for (const schema of current) {
      if (typeof segment === "number") {
        const item =
          schema.prefixItems?.[segment] ??
          (schema.items === false ? undefined : schema.items);
        next.push(...alternatives(root, item));
        continue;
      }
      const property = schema.properties?.[segment];
      if (property) {
        next.push(...alternatives(root, property));
        continue;
      }
      const pattern = Object.entries(schema.patternProperties ?? {}).find(
        ([regex]) => safeTest(regex, segment),
      );
      if (pattern) {
        next.push(...alternatives(root, pattern[1]));
      } else if (typeof schema.additionalProperties === "object") {
        next.push(...alternatives(root, schema.additionalProperties));
      }
    }
    current = next;
    if (!current.length) break;
  }
  return current;
}

function safeTest(regex: string, value: string): boolean {
  try {
    return new RegExp(regex, "u").test(value);
  } catch {
    return false;
  }
}

/** A property that a mapping may have. */
export type PropertyInfo = {
  name: string;
  schema: JsonSchema;
  required: boolean;
};

/** Return the properties that the mapping at a path declares, from all of its alternatives. */
export function propertiesAtPath(
  root: JsonSchema,
  path: PathSegment[],
): PropertyInfo[] {
  const byName = new Map<string, PropertyInfo>();
  for (const schema of schemasAtPath(root, path)) {
    const required = new Set(schema.required ?? []);
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      if (!byName.has(name))
        byName.set(name, {
          name,
          schema: property,
          required: required.has(name),
        });
    }
  }
  return [...byName.values()];
}

/**
 * Return whether the mapping at a path may only have the keys its schema declares. That is true of
 * a Pydantic model's object, which lists its fields in `properties`, but not of a dict field, which
 * has `additionalProperties`, nor of a schema without properties, which accepts any object.
 */
export function isClosedMapping(
  root: JsonSchema,
  path: PathSegment[],
): boolean {
  const schemas = schemasAtPath(root, path).filter(isObjectSchema);
  if (!schemas.length) return false;
  return schemas.every(
    (schema) =>
      !!schema.properties &&
      Object.keys(schema.properties).length > 0 &&
      (schema.additionalProperties === undefined ||
        schema.additionalProperties === false) &&
      !schema.patternProperties,
  );
}

/** Return the values that a path's value may have when it has a finite set: enum, const, boolean. */
export function valueChoices(root: JsonSchema, path: PathSegment[]): unknown[] {
  const values: unknown[] = [];
  for (const schema of schemasAtPath(root, path)) {
    if (schema.enum) values.push(...schema.enum);
    if (schema.const !== undefined) values.push(schema.const);
    if (typesOf(schema).includes("boolean")) values.push(true, false);
  }
  return [...new Set(values.map((v) => JSON.stringify(v)))].map((v) =>
    JSON.parse(v),
  );
}

/** Return a schema's type, as a short human-readable string, e.g. "string | null". */
export function typeLabel(root: JsonSchema, schema: JsonSchema): string {
  const resolved = resolveRef(root, schema);
  const union = resolved.anyOf ?? resolved.oneOf;
  if (union) {
    return [...new Set(union.map((member) => typeLabel(root, member)))].join(
      " | ",
    );
  }
  if (resolved.enum)
    return resolved.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (resolved.const !== undefined) return JSON.stringify(resolved.const);
  const types = typesOf(resolved);
  if (types.includes("array")) {
    const item = resolved.items ? typeLabel(root, resolved.items) : "any";
    return `${item.includes("|") ? `(${item})` : item}[]`;
  }
  if (types.length) {
    return types
      .map((type) =>
        type === "string" && resolved.format
          ? `string (${resolved.format})`
          : type,
      )
      .join(" | ");
  }
  if (resolved.title && resolved.properties) return resolved.title;
  return "any";
}

/** Return Markdown that documents a property: its type, whether it is required, and its description. */
export function describeProperty(
  root: JsonSchema,
  name: string,
  schema: JsonSchema,
  required = false,
): string {
  const resolved = resolveRef(root, schema);
  const lines: string[] = [];
  lines.push(
    `**${name}**: \`${typeLabel(root, schema)}\`${required ? " — *required*" : ""}`,
  );
  const description = cleanDescription(
    resolved.description ?? alternatives(root, schema)[0]?.description,
  );
  if (description) lines.push("", description);
  const facts: string[] = [];
  if (resolved.default !== undefined && resolved.default !== null) {
    facts.push(`Default: \`${JSON.stringify(resolved.default)}\``);
  }
  for (const member of alternatives(root, schema)) {
    if (member.pattern) facts.push(`Pattern: \`${member.pattern}\``);
    if (member.minimum !== undefined) facts.push(`Minimum: ${member.minimum}`);
    if (member.maximum !== undefined) facts.push(`Maximum: ${member.maximum}`);
    if (member.maxLength !== undefined)
      facts.push(`Max length: ${member.maxLength}`);
  }
  const examples = resolved.examples ?? [];
  if (examples.length)
    facts.push(
      `Examples: ${examples.map((e) => `\`${JSON.stringify(e)}\``).join(", ")}`,
    );
  if (facts.length) lines.push("", [...new Set(facts)].join("  \n"));
  return lines.join("\n");
}

/**
 * Tidy a Pydantic field description: dedent the indentation that a triple-quoted Python string
 * leaves on every line after the first.
 */
export function cleanDescription(description: string | undefined): string {
  if (!description) return "";
  return description
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/([^\n])\n(?=[^\n-*])/g, "$1 ")
    .trim();
}
