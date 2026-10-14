/**
 * Completion of a manifest's keys and values from its kind's JSON Schema, for the mapping or value
 * that the cursor is in. Returns plain suggestions, with VS Code snippet syntax in insertText.
 */
import {
  alternatives,
  cleanDescription,
  describeProperty,
  isArraySchema,
  isObjectSchema,
  JsonSchema,
  propertiesAtPath,
  typeLabel,
  valueChoices,
} from "./schema";
import { CompletionContext, PathSegment, SMARTER_API_VERSION } from "./yamlDoc";

export type Suggestion = {
  label: string;
  kind: "property" | "value" | "kind";
  /** Snippet text. */
  insertText: string;
  detail?: string;
  /** Markdown. */
  documentation?: string;
  sortText?: string;
  /** Whether the suggestion is the schema's default value, or a required key. */
  preselect?: boolean;
};

/** The keys that every manifest has, before its kind is known. */
const ROOT_KEYS: Suggestion[] = [
  {
    label: "apiVersion",
    kind: "property",
    insertText: `apiVersion: ${SMARTER_API_VERSION}`,
    detail: SMARTER_API_VERSION,
    documentation: "The manifest's api version. Always `smarter.sh/v1`.",
    sortText: "0",
  },
  {
    label: "kind",
    kind: "property",
    insertText: "kind: $0",
    detail: "string",
    documentation:
      "The kind of resource that the manifest declares, e.g. `LLMClient`.",
    sortText: "1",
  },
];

/** Escape a value for a snippet's choice list. */
function choiceText(value: unknown): string {
  return scalarText(value).replace(/([$}\\,|])/g, "\\$1");
}

/** Return a value as a YAML scalar, quoted if a plain scalar would read as something else. */
export function scalarText(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  if (value === "" || /^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|: | #/.test(value))
    return JSON.stringify(value);
  if (/^(true|false|null|yes|no|on|off|~|[-+]?(\d|\.\d))/i.test(value))
    return JSON.stringify(value);
  return value;
}

/** Return the snippet that inserts a key, laid out for its type. */
function keySnippet(
  root: JsonSchema,
  name: string,
  schema: JsonSchema,
): string {
  const members = alternatives(root, schema);
  const values = [
    ...new Set(
      members.flatMap((member) => [
        ...(member.enum ?? []),
        ...(member.const !== undefined ? [member.const] : []),
        ...(member.type === "boolean" ? [true, false] : []),
      ]),
    ),
  ];
  if (values.length) {
    return `${name}: \${1|${values.map(choiceText).join(",")}|}`;
  }
  if (members.length && members.every((member) => isArraySchema(member))) {
    return `${name}:\n  - $0`;
  }
  if (
    members.length &&
    members.every((member) => isObjectSchema(member) && !!member.properties)
  ) {
    return `${name}:\n  $0`;
  }
  return `${name}: $0`;
}

/** Return the keys that the mapping at a path may have, without those it already has. */
export function keySuggestions(
  root: JsonSchema | undefined,
  parentPath: PathSegment[],
  existing: string[],
): Suggestion[] {
  if (!root)
    return parentPath.length === 0
      ? ROOT_KEYS.filter((s) => !existing.includes(s.label))
      : [];
  return propertiesAtPath(root, parentPath)
    .filter((property) => !existing.includes(property.name))
    .filter(
      (property) => !(parentPath.length === 0 && property.name === "status"),
    )
    .map((property) => {
      const resolved = alternatives(root, property.schema);
      const readOnly = resolved.some((member) => member.readOnly);
      return {
        label: property.name,
        kind: "property" as const,
        insertText: keySnippet(root, property.name, property.schema),
        detail: `${typeLabel(root, property.schema)}${property.required ? " (required)" : ""}${readOnly ? " (read only)" : ""}`,
        documentation: describeProperty(
          root,
          property.name,
          property.schema,
          property.required,
        ),
        // required keys first, then the schema's order.
        sortText: `${property.required ? "0" : "1"}`,
        preselect: property.required,
      };
    })
    .map((suggestion, i) => ({
      ...suggestion,
      sortText: `${suggestion.sortText}${String(i).padStart(3, "0")}`,
    }));
}

/** Return the values that a path's value may have. */
export function valueSuggestions(
  root: JsonSchema | undefined,
  path: PathSegment[],
  kinds: string[],
): Suggestion[] {
  if (path.length === 1 && path[0] === "apiVersion") {
    return [
      {
        label: SMARTER_API_VERSION,
        kind: "value",
        insertText: SMARTER_API_VERSION,
      },
    ];
  }
  if (path.length === 1 && path[0] === "kind") {
    return kinds.map((kind) => ({
      label: kind,
      kind: "kind",
      insertText: kind,
    }));
  }
  if (!root) return [];
  const defaults = new Set(
    alternatives(root, propertySchema(root, path))
      .map((member) => member.default)
      .filter((value) => value !== undefined && value !== null)
      .map((value) => JSON.stringify(value)),
  );
  return valueChoices(root, path).map((value, i) => {
    const isDefault = defaults.has(JSON.stringify(value));
    return {
      label: String(value),
      kind: "value" as const,
      insertText: scalarText(value),
      sortText: String(i).padStart(3, "0"),
      preselect: isDefault,
      documentation: isDefault ? "The default." : undefined,
    };
  });
}

/** Return the schema of the property at a path, as its parent declares it, or an empty schema. */
function propertySchema(root: JsonSchema, path: PathSegment[]): JsonSchema {
  const parent = propertiesAtPath(root, path.slice(0, -1));
  return (
    parent.find((property) => property.name === path[path.length - 1])
      ?.schema ?? {}
  );
}

/** Return the suggestions for a completion context. */
export function suggestions(
  context: CompletionContext,
  root: JsonSchema | undefined,
  existingKeys: string[],
  kinds: string[],
): Suggestion[] {
  if (context.position === "key")
    return keySuggestions(root, context.parentPath, existingKeys);
  return valueSuggestions(root, context.path, kinds);
}

/** Return Markdown that documents the key or value at a path, for a hover. */
export function hoverMarkdown(
  root: JsonSchema,
  path: PathSegment[],
): string | undefined {
  const name = [...path]
    .reverse()
    .find((segment): segment is string => typeof segment === "string");
  if (name === undefined) return undefined;
  const index = path.lastIndexOf(name);
  const parentPath = path.slice(0, index);
  const property = propertiesAtPath(root, parentPath).find(
    (p) => p.name === name,
  );
  if (!property) return undefined;
  const location = path
    .filter((segment) => typeof segment === "string")
    .join(".");
  return `${describeProperty(root, name, property.schema, property.required)}\n\n---\n\`${location}\``;
}

/** Return Markdown that describes a kind, for a hover over its name. */
export function kindMarkdown(
  kind: string,
  root: JsonSchema | undefined,
  docsUrl: string,
): string {
  const description = cleanDescription(root?.description);
  return `**${kind}**${description ? `\n\n${description}` : ""}\n\n[Documentation](${docsUrl})`;
}
