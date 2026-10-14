/**
 * YAML helpers that don't depend on VS Code: parse a file's manifests, and map between offsets
 * in the text and paths in a manifest, e.g. ["spec", "config", "provider"].
 *
 * The `yaml` package keeps every node's position, and keeps parsing after a syntax error, so a
 * manifest with an error still has an AST to validate, complete and hover over.
 */
import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  Node,
  parseAllDocuments,
  ParseOptions,
  Scalar,
  SchemaOptions,
  DocumentOptions,
} from "yaml";

/** A segment of a path in a manifest: a mapping's key, or a sequence's index. */
export type PathSegment = string | number;

/** Text offsets: start inclusive, end exclusive. */
export type Span = { start: number; end: number };

/** Where a path is in the text: its key, if it is a mapping's value, and its value. */
export type PathSpans = { key?: Span; value?: Span };

/** One YAML document of a file, and whether it is a Smarter manifest. */
export type ManifestDocument = {
  doc: Document.Parsed;
  /** The document's span in the file. */
  span: Span;
  /** The document as plain JSON, or undefined if it is empty. */
  value: unknown;
  /** Whether the document's apiVersion is smarter.sh/v1. */
  isManifest: boolean;
  /** The document's kind, if it has one. */
  kind?: string;
};

export const SMARTER_API_VERSION = "smarter.sh/v1";

const API_VERSION_LINE = /^apiVersion:\s*["']?smarter\.sh\/v1["']?\s*(#.*)?$/m;

/**
 * Return whether a text has a Smarter manifest, from its apiVersion line. This is a regular
 * expression rather than a parse so that a manifest with a syntax error is still recognized, and
 * its error reported.
 */
export function looksLikeManifest(text: string): boolean {
  return API_VERSION_LINE.test(text);
}

type ScalarTag = { tag: string; format?: string; test?: RegExp };

const BOOL = "tag:yaml.org,2002:bool";
const INT = "tag:yaml.org,2002:int";
const FLOAT = "tag:yaml.org,2002:float";
const TIMESTAMP = "tag:yaml.org,2002:timestamp";

/**
 * Adjust the `yaml` package's YAML 1.1 scalar tags to PyYAML's, which the platform reads manifests
 * with (yaml.safe_load). For example `postalCode: 02139` is the string "02139" there, not the
 * integer 2139, `y` is a string, and `1e5` is a string. Timestamps are dropped, so that a date
 * stays a string, as it is in the json that the platform's Pydantic models validate.
 */
function pyyamlTags(tags: unknown[]): unknown[] {
  return tags
    .filter((tag) => (tag as ScalarTag).tag !== TIMESTAMP)
    .map((tag) => {
      const t = tag as ScalarTag;
      const source = String(t.test ?? "");
      let test: RegExp | undefined;
      if (t.tag === BOOL) {
        test = source.includes("es")
          ? /^(?:[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/
          : /^(?:[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/;
      } else if (t.tag === INT && !t.format) {
        test = /^[-+]?(?:0|[1-9][0-9_]*)$/;
      } else if (t.tag === INT && t.format === "TIME") {
        test = /^[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+$/;
      } else if (t.tag === FLOAT && t.format === "EXP") {
        test = /^[-+]?[0-9][0-9_]*\.[0-9_]*[eE][-+][0-9]+$/;
      } else if (t.tag === FLOAT && !t.format && !/inf|nan/i.test(source)) {
        test = /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*|\.[0-9][0-9_]*)$/;
      }
      return test ? { ...t, test } : tag;
    });
}

/** Parse options that read scalars the way the platform does: YAML 1.1, as PyYAML. */
export const PARSE_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  version: "1.1",
  customTags: pyyamlTags as SchemaOptions["customTags"],
  keepSourceTokens: false,
  prettyErrors: false,
};

/** Parse every YAML document of a text. */
export function parseManifests(text: string): ManifestDocument[] {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, { ...PARSE_OPTIONS, lineCounter });
  const list = Array.isArray(docs) ? docs : [];
  return list.map((doc) => {
    let value: unknown;
    try {
      value = doc.toJS({ maxAliasCount: 100 });
    } catch {
      value = undefined;
    }
    const record = isRecord(value) ? value : undefined;
    const apiVersion = record?.apiVersion;
    const kind = typeof record?.kind === "string" ? record.kind : undefined;
    const [start, , end] = doc.range;
    // a document too broken to have an apiVersion is still a manifest if its apiVersion line says so.
    const isManifest =
      apiVersion === SMARTER_API_VERSION ||
      (apiVersion === undefined && looksLikeManifest(text.slice(start, end)));
    return { doc, span: { start, end }, value, isManifest, kind };
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeSpan(node: Node | null | undefined): Span | undefined {
  const range = node?.range;
  if (!range) return undefined;
  return { start: range[0], end: range[1] };
}

/**
 * Return where a path is in a document: its key's span, and its value's span. When the path is
 * not there, return the spans of its nearest ancestor that is, so that an error about a missing
 * value can be shown on its parent. An empty path is the document's contents.
 */
export function spansAtPath(
  doc: Document.Parsed,
  path: PathSegment[],
): PathSpans & { depth: number } {
  let node: unknown = doc.contents;
  let spans: PathSpans = { value: nodeSpan(doc.contents as Node) };
  let depth = 0;
  for (const segment of path) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) =>
          isScalar(item.key) && String(item.key.value) === String(segment),
      );
      if (!pair) break;
      spans = {
        key: nodeSpan(pair.key as Node),
        value: nodeSpan(pair.value as Node),
      };
      node = pair.value;
    } else if (isSeq(node) && typeof segment === "number") {
      const item = node.items[segment];
      if (!item) break;
      spans = { value: nodeSpan(item as Node) };
      node = item;
    } else {
      break;
    }
    depth += 1;
  }
  return { ...spans, depth };
}

/** What is at an offset: the path of the innermost key or value, and whether it is a key. */
export type OffsetTarget = {
  path: PathSegment[];
  isKey: boolean;
  /** The span of the scalar at the offset, if it is a scalar. */
  span?: Span;
};

/** Return the path of the key or scalar value at an offset of the text, or undefined. */
export function targetAtOffset(
  doc: Document.Parsed,
  offset: number,
): OffsetTarget | undefined {
  const visit = (
    node: unknown,
    path: PathSegment[],
  ): OffsetTarget | undefined => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = pair.key as Node | null;
        const keySpan = nodeSpan(key);
        const name = isScalar(key) ? String(key.value) : undefined;
        if (name === undefined) continue;
        if (keySpan && offset >= keySpan.start && offset <= keySpan.end) {
          return { path: [...path, name], isKey: true, span: keySpan };
        }
        const found = visit(pair.value, [...path, name]);
        if (found) return found;
      }
      return undefined;
    }
    if (isSeq(node)) {
      for (let i = 0; i < node.items.length; i++) {
        const found = visit(node.items[i], [...path, i]);
        if (found) return found;
      }
      return undefined;
    }
    if (isScalar(node)) {
      const span = nodeSpan(node);
      if (span && offset >= span.start && offset <= span.end)
        return { path, isKey: false, span };
    }
    return undefined;
  };
  return visit(doc.contents, []);
}

/** Return the keys of the mapping at a path, or none if it is not a mapping. */
export function keysAtPath(
  doc: Document.Parsed,
  path: PathSegment[],
): string[] {
  const node = path.length ? doc.getIn(path, true) : doc.contents;
  if (!isMap(node)) return [];
  return node.items.flatMap((item) =>
    isPair(item) && isScalar(item.key) ? [String(item.key.value)] : [],
  );
}

/** Return the scalar at a path, if there is one. */
export function scalarAtPath(
  doc: Document.Parsed,
  path: PathSegment[],
): Scalar | undefined {
  const node = doc.getIn(path, true);
  return isScalar(node) ? node : undefined;
}

/** The placeholder key that {@link completionPath} puts at the cursor. */
const CURSOR_KEY = "__smarter_cursor__";

/** Where a completion is: the path of the mapping it adds a key to, or of the value it completes. */
export type CompletionContext =
  | {
      position: "key";
      parentPath: PathSegment[];
      prefix: string;
      indent: number;
    }
  | { position: "value"; path: PathSegment[]; prefix: string };

/**
 * Return what the cursor at an offset completes: a key of a mapping, or a key's value.
 *
 * A half-typed key isn't YAML yet, e.g. `  prov` on its own line is a scalar that continues its
 * parent's value. So the cursor's line is replaced with a placeholder key at the same indentation,
 * and the placeholder's path in the parsed text says which mapping the key belongs to.
 */
export function completionContext(
  text: string,
  offset: number,
): CompletionContext | undefined {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const nextNewline = text.indexOf("\n", offset);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const before = text.slice(lineStart, offset);

  // a value: "  key: val|", or "  - key: val|"
  const valueMatch = /^(\s*(?:-\s+)*)([^\s#:'"][^:#]*?):\s+([^#]*)$/.exec(
    before,
  );
  if (valueMatch) {
    const docs = parseManifests(text);
    const doc =
      docs.find((d) => offset >= d.span.start && offset <= d.span.end) ??
      docs[0];
    if (!doc) return undefined;
    const keyOffset = lineStart + valueMatch[1].length;
    const target = targetAtOffset(doc.doc, keyOffset);
    if (!target || !target.isKey) return undefined;
    return {
      position: "value",
      path: target.path,
      prefix: valueMatch[3].trim().replace(/^["']/, ""),
    };
  }

  // a key: "  pre|", "  - pre|", or an empty line
  const keyMatch = /^(\s*(?:-\s+)*)([\w.-]*)$/.exec(before);
  if (!keyMatch) return undefined;
  const indentText = keyMatch[1];
  const prefix = keyMatch[2];
  const replaced =
    text.slice(0, lineStart) +
    `${indentText}${CURSOR_KEY}:` +
    text.slice(lineEnd);
  const docs = parseManifests(replaced);
  const at = lineStart + indentText.length;
  const doc =
    docs.find((d) => at >= d.span.start && at <= d.span.end) ?? docs[0];
  if (!doc) return undefined;
  const target = targetAtOffset(doc.doc, at + 1);
  if (
    !target ||
    !target.isKey ||
    target.path[target.path.length - 1] !== CURSOR_KEY
  )
    return undefined;
  return {
    position: "key",
    parentPath: target.path.slice(0, -1),
    prefix,
    indent: indentText.length,
  };
}
