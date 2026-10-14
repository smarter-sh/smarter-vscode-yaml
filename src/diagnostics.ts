/**
 * Diagnostics of Smarter manifests, in two collections:
 *
 * - "smarter": the JSON Schema validation that runs as you type, in the editor;
 * - "smarter-platform": the platform's own validation, by the cli api's validate command, which
 *   runs the kind's Pydantic model, as apply does. It runs on demand, or on save, and is cleared
 *   as soon as the document changes, since it describes the text that was sent.
 */
import * as vscode from "vscode";

import type { SmarterApi } from "./core/api";
import type { SchemaStore } from "./core/schemaStore";
import { Problem, ProblemData, spanOf, validateText } from "./core/validate";
import { looksLikeManifest, parseManifests } from "./core/yamlDoc";
import { log } from "./log";
import { settings } from "./settings";

const DEBOUNCE_MS = 250;

const SEVERITY: Record<Problem["severity"], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/** A diagnostic's quick fix data, kept beside it: VS Code hands code actions copies of diagnostics. */
type Fixable = { range: vscode.Range; code: string; data: ProblemData };

export class ManifestDiagnostics implements vscode.Disposable {
  readonly local = vscode.languages.createDiagnosticCollection("smarter");
  readonly platform =
    vscode.languages.createDiagnosticCollection("smarter-platform");
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly fixes = new Map<string, Fixable[]>();

  constructor(private readonly schemas: SchemaStore) {}

  /** Whether a document is a Smarter manifest that this extension handles. */
  static isManifest(document: vscode.TextDocument): boolean {
    return (
      document.languageId === "yaml" && looksLikeManifest(document.getText())
    );
  }

  /** Validate a document after a short pause, so that typing doesn't validate on every keystroke. */
  schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.validate(document);
      }, DEBOUNCE_MS),
    );
  }

  async validate(document: vscode.TextDocument): Promise<void> {
    if (document.isClosed) return;
    if (!ManifestDiagnostics.isManifest(document)) {
      this.clear(document.uri);
      return;
    }
    const version = document.version;
    const text = document.getText();
    let problems: Problem[];
    try {
      problems = await validateText(text, {
        schemaFor: (kind) => this.schemas.schema(kind),
        kinds: await this.schemas.kinds(),
        unknownKeys: settings.unknownKeys(),
      });
    } catch (error) {
      log.error(
        `Validation of ${document.uri.fsPath} failed: ${String(error)}`,
      );
      return;
    }
    // a newer version is being validated.
    if (document.version !== version || document.isClosed) return;
    const fixes: Fixable[] = [];
    const diagnostics = problems.map((problem) => {
      const range = new vscode.Range(
        document.positionAt(problem.span.start),
        document.positionAt(problem.span.end),
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        problem.message,
        SEVERITY[problem.severity],
      );
      diagnostic.source = "smarter";
      diagnostic.code = problem.code;
      if (problem.code === "unknown-key")
        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
      if (problem.data)
        fixes.push({ range, code: problem.code, data: problem.data });
      return diagnostic;
    });
    this.fixes.set(document.uri.toString(), fixes);
    this.local.set(document.uri, diagnostics);
  }

  /** Return the quick fix data of a diagnostic, if it has some. */
  fixFor(
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic,
  ): ProblemData | undefined {
    const code =
      typeof diagnostic.code === "object"
        ? diagnostic.code.value
        : diagnostic.code;
    return this.fixes
      .get(uri.toString())
      ?.find((fix) => fix.code === code && fix.range.isEqual(diagnostic.range))
      ?.data;
  }

  /** The document changed: the platform's diagnostics describe the old text. */
  changed(document: vscode.TextDocument): void {
    this.platform.delete(document.uri);
    this.schedule(document);
  }

  clear(uri: vscode.Uri): void {
    clearTimeout(this.timers.get(uri.toString()));
    this.timers.delete(uri.toString());
    this.local.delete(uri);
    this.platform.delete(uri);
    this.fixes.delete(uri.toString());
  }

  /** Revalidate every open manifest, e.g. when a setting or the platform changes. */
  revalidateAll(): void {
    for (const document of vscode.workspace.textDocuments) {
      if (ManifestDiagnostics.isManifest(document)) this.schedule(document);
    }
  }

  /**
   * Validate each manifest of a document on the platform, and show its errors. Return the number
   * of errors, or undefined if the platform couldn't validate it.
   */
  async validateOnPlatform(
    document: vscode.TextDocument,
    api: SmarterApi,
  ): Promise<number> {
    const version = document.version;
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];
    for (const manifest of parseManifests(text)) {
      if (!manifest.isManifest || manifest.doc.errors.length) continue;
      const validation = await api.validate(
        text.slice(manifest.span.start, manifest.span.end),
      );
      for (const error of validation.errors) {
        const loc = error.loc ?? [];
        const span = spanOf(manifest.doc, loc, false);
        const range = new vscode.Range(
          document.positionAt(span.start),
          document.positionAt(span.end),
        );
        const where = loc.length ? `${loc.join(".")}: ` : "";
        const diagnostic = new vscode.Diagnostic(
          range,
          `${where}${error.message}`,
          vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = `smarter (${api.rootUrl.replace(/^https?:\/\//, "")})`;
        diagnostic.code = error.type;
        diagnostics.push(diagnostic);
      }
    }
    if (document.version === version)
      this.platform.set(document.uri, diagnostics);
    return diagnostics.length;
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.local.dispose();
    this.platform.dispose();
  }
}

/** Return a manifest without its status, which is read only, as the cli api expects it. */
export function withoutStatus(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { status: _status, ...rest } = value as Record<string, unknown>;
  return rest;
}
