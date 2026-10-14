/** The language features of Smarter manifests: completion, hover, quick fixes and code lenses. */
import * as vscode from "vscode";
import { stringify } from "yaml";

import {
  hoverMarkdown,
  kindMarkdown,
  scalarText,
  suggestions,
} from "./core/completion";
import { docsUrl } from "./core/docs";
import type { SchemaStore } from "./core/schemaStore";
import {
  completionContext,
  keysAtPath,
  looksLikeManifest,
  parseManifests,
  targetAtOffset,
} from "./core/yamlDoc";
import { ManifestDiagnostics, withoutStatus } from "./diagnostics";
import { settings } from "./settings";

export const SELECTOR: vscode.DocumentSelector = [
  { language: "yaml", scheme: "file" },
  { language: "yaml", scheme: "untitled" },
];

/** The manifest of a document that contains an offset, for a multi-document file. */
function manifestAt(text: string, offset: number) {
  const manifests = parseManifests(text);
  return (
    manifests.find((m) => offset >= m.span.start && offset <= m.span.end) ??
    manifests[manifests.length - 1]
  );
}

/** Return a manifest as YAML, the way the platform's examples are laid out. */
export function manifestYaml(manifest: unknown): string {
  return stringify(withoutStatus(manifest), {
    lineWidth: 0,
    indent: 2,
    indentSeq: true,
  });
}

export class CompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly schemas: SchemaStore) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const text = document.getText();
    if (!looksLikeManifest(text))
      return this.newManifestItems(document, position);

    const offset = document.offsetAt(position);
    const context = completionContext(text, offset);
    if (!context) return undefined;
    const manifest = manifestAt(text, offset);
    const kind = manifest?.kind;
    const schema = kind ? await this.schemas.schema(kind) : undefined;
    const kinds = await this.schemas.kinds();
    const existing =
      context.position === "key" && manifest
        ? keysAtPath(manifest.doc, context.parentPath)
        : [];
    const wordRange = document.getWordRangeAtPosition(position, /[\w./-]+/);

    return suggestions(context, schema, existing, kinds).map((suggestion) => {
      const item = new vscode.CompletionItem(
        suggestion.label,
        suggestion.kind === "property"
          ? vscode.CompletionItemKind.Property
          : suggestion.kind === "kind"
            ? vscode.CompletionItemKind.Class
            : vscode.CompletionItemKind.EnumMember,
      );
      item.insertText = new vscode.SnippetString(suggestion.insertText);
      if (wordRange) item.range = wordRange;
      item.detail = suggestion.detail;
      if (suggestion.documentation)
        item.documentation = new vscode.MarkdownString(
          suggestion.documentation,
        );
      if (suggestion.kind === "kind") {
        item.documentation = new vscode.MarkdownString(
          `[Documentation](${docsUrl(suggestion.label)})`,
        );
      }
      item.sortText = suggestion.sortText;
      item.preselect = suggestion.preselect;
      // after a key whose value goes on the next lines, suggest its keys right away.
      if (
        suggestion.kind === "property" &&
        suggestion.insertText.includes("\n")
      ) {
        item.command = {
          command: "editor.action.triggerSuggest",
          title: "Suggest",
        };
      }
      return item;
    });
  }

  /** In a YAML file that isn't a manifest yet, offer each kind's example manifest. */
  private async newManifestItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const rest = document
      .getText()
      .replace(document.lineAt(position.line).text, "")
      .trim();
    if (rest.length) return undefined;
    const items: vscode.CompletionItem[] = [];
    for (const kind of await this.schemas.kinds()) {
      const example = await this.schemas.example(kind);
      if (!example) continue;
      const item = new vscode.CompletionItem(
        `smarter ${kind}`,
        vscode.CompletionItemKind.Snippet,
      );
      item.filterText = `smarter-${kind} smarter ${kind}`;
      item.detail = `Smarter ${kind} manifest`;
      const yaml = manifestYaml(example);
      item.documentation = new vscode.MarkdownString().appendCodeblock(
        yaml,
        "yaml",
      );
      item.insertText = yaml;
      item.range = document.lineAt(position.line).range;
      items.push(item);
    }
    return items;
  }
}

export class HoverProvider implements vscode.HoverProvider {
  constructor(private readonly schemas: SchemaStore) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!ManifestDiagnostics.isManifest(document)) return undefined;
    const text = document.getText();
    const offset = document.offsetAt(position);
    const manifest = manifestAt(text, offset);
    if (!manifest?.isManifest) return undefined;
    const target = targetAtOffset(manifest.doc, offset);
    if (!target) return undefined;
    const range = target.span
      ? new vscode.Range(
          document.positionAt(target.span.start),
          document.positionAt(target.span.end),
        )
      : undefined;
    const kind = manifest.kind;
    const schema = kind ? await this.schemas.schema(kind) : undefined;

    if (kind && target.path.length === 1 && target.path[0] === "kind") {
      const markdown = new vscode.MarkdownString(
        kindMarkdown(kind, schema, docsUrl(kind)),
      );
      return new vscode.Hover(markdown, range);
    }
    if (!schema) return undefined;
    const markdown = hoverMarkdown(schema, target.path);
    if (!markdown) return undefined;
    return new vscode.Hover(new vscode.MarkdownString(markdown), range);
  }
}

export class QuickFixProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly diagnostics: ManifestDiagnostics) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "smarter") continue;
      const data = this.diagnostics.fixFor(document.uri, diagnostic);
      if (!data) continue;
      const fix = (
        title: string,
        edit: (e: vscode.WorkspaceEdit) => void,
        preferred = false,
      ) => {
        const action = new vscode.CodeAction(
          title,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        edit(action.edit);
        action.isPreferred = preferred;
        actions.push(action);
      };
      switch (data.fix) {
        case "rename-key":
          fix(
            `Change to '${data.replacement}'`,
            (e) => e.replace(document.uri, diagnostic.range, data.replacement),
            true,
          );
          break;
        case "set-kind":
          fix(
            `Change kind to '${data.replacement}'`,
            (e) => e.replace(document.uri, diagnostic.range, data.replacement),
            true,
          );
          break;
        case "replace-value":
          data.choices.slice(0, 10).forEach((choice, i) => {
            const text = scalarText(choice);
            fix(
              `Change to ${text}`,
              (e) => e.replace(document.uri, diagnostic.range, text),
              i === 0 && data.choices.length === 1,
            );
          });
          break;
        case "add-key": {
          const position = document.positionAt(data.after);
          fix(
            `Add '${data.key}'`,
            (e) =>
              e.insert(
                document.uri,
                position,
                `\n${" ".repeat(data.indent)}${data.key}: `,
              ),
            true,
          );
          break;
        }
      }
    }
    return actions;
  }
}

export class ManifestCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  constructor(private readonly hostLabel: () => string) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!settings.codeLens() || !ManifestDiagnostics.isManifest(document))
      return [];
    const lenses: vscode.CodeLens[] = [];
    for (const manifest of parseManifests(document.getText())) {
      if (!manifest.isManifest) continue;
      const range = document.lineAt(
        document.positionAt(manifest.span.start).line,
      ).range;
      const host = this.hostLabel();
      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(check) Validate on ${host}`,
          command: "smarter.validateOnServer",
          arguments: [document.uri],
        }),
        new vscode.CodeLens(range, {
          title: `$(cloud-upload) Apply to ${host}`,
          command: "smarter.apply",
          arguments: [document.uri, manifest.span.start],
        }),
      );
      if (manifest.kind) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `$(book) ${manifest.kind} docs`,
            command: "vscode.open",
            arguments: [vscode.Uri.parse(docsUrl(manifest.kind))],
          }),
        );
      }
    }
    return lenses;
  }
}
