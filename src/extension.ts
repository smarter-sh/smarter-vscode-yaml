/**
 * Smarter Manifest: a VS Code extension for Smarter's YAML manifests (SAM, the Smarter Application
 * Manifest). A YAML file whose apiVersion is smarter.sh/v1 is a manifest.
 */
import * as path from "path";
import * as vscode from "vscode";

import { SchemaStore } from "./core/schemaStore";
import { registerCommands } from "./commands";
import { ManifestDiagnostics } from "./diagnostics";
import { log } from "./log";
import { Platform } from "./platform";
import {
  CompletionProvider,
  HoverProvider,
  ManifestCodeLensProvider,
  QuickFixProvider,
  SELECTOR,
} from "./providers";
import { settings } from "./settings";

export function activate(context: vscode.ExtensionContext): void {
  const version =
    (context.extension.packageJSON as { version?: string }).version ?? "0.0.0";
  const userAgent = `smarter-vscode-yaml/${version} vscode/${vscode.version}`;
  log.info(
    `Smarter Manifest ${version} is active. Platform: ${settings.rootUrl()}`,
  );

  const platform = new Platform(context, userAgent);
  const schemas = new SchemaStore({
    bundledDir: path.join(context.extensionPath, "contract", "sam"),
    source: () => settings.schemaSource(),
    api: () => platform.publicApi(),
    log: (message) => log.info(message),
  });
  const diagnostics = new ManifestDiagnostics(schemas);
  const codeLenses = new ManifestCodeLensProvider(() => platform.host);

  // the smarter.isManifest context key shows the manifest commands in menus.
  const updateActiveEditor = (editor = vscode.window.activeTextEditor) => {
    const isManifest =
      !!editor && ManifestDiagnostics.isManifest(editor.document);
    void vscode.commands.executeCommand(
      "setContext",
      "smarter.isManifest",
      isManifest,
    );
    platform.setVisible(isManifest);
  };

  context.subscriptions.push(
    { dispose: () => log.dispose() },
    platform,
    diagnostics,
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      new CompletionProvider(schemas),
      ":",
      " ",
      "-",
    ),
    vscode.languages.registerHoverProvider(
      SELECTOR,
      new HoverProvider(schemas),
    ),
    vscode.languages.registerCodeActionsProvider(
      SELECTOR,
      new QuickFixProvider(diagnostics),
      {
        providedCodeActionKinds: QuickFixProvider.kinds,
      },
    ),
    vscode.languages.registerCodeLensProvider(SELECTOR, codeLenses),
    ...registerCommands({
      platform,
      schemas,
      diagnostics,
      refresh: () => codeLenses.refresh(),
    }),

    vscode.workspace.onDidOpenTextDocument((document) =>
      diagnostics.schedule(document),
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length === 0) return;
      diagnostics.changed(event.document);
      if (event.document === vscode.window.activeTextEditor?.document)
        updateActiveEditor();
    }),
    vscode.workspace.onDidCloseTextDocument((document) =>
      diagnostics.clear(document.uri),
    ),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (
        !settings.validateOnSave() ||
        !ManifestDiagnostics.isManifest(document)
      )
        return;
      const key = await platform.apiKey();
      if (!key) return; // validate on save never prompts: the command does.
      const api = await platform.api();
      if (!api) return;
      try {
        await diagnostics.validateOnPlatform(document, api);
      } catch (error) {
        log.warn(`Validation on save failed: ${String(error)}`);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      updateActiveEditor(editor),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("smarterYaml")) {
        schemas.clear();
        diagnostics.revalidateAll();
        codeLenses.refresh();
      }
    }),
    platform.onDidChange(() => {
      log.info(`Platform: ${platform.rootUrl}`);
      void platform.refreshAccount();
      codeLenses.refresh();
    }),
  );

  updateActiveEditor();
  diagnostics.revalidateAll();
  void platform.refreshAccount();
}

export function deactivate(): void {
  // everything is disposed of by the extension context's subscriptions.
}
