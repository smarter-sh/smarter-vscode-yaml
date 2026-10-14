/** The extension's commands. */
import * as vscode from "vscode";

import { SmarterApi } from "./core/api";
import { cleanDescription } from "./core/schema";
import { docsUrl } from "./core/docs";
import type { SchemaStore } from "./core/schemaStore";
import { isRecord, ManifestDocument, parseManifests } from "./core/yamlDoc";
import { ManifestDiagnostics } from "./diagnostics";
import { log } from "./log";
import type { Platform } from "./platform";
import { manifestYaml } from "./providers";
import { DEFAULT_ROOT_URL, settings } from "./settings";

/** The platforms offered by Select Platform. Any other is entered with "Other...". */
const KNOWN_PLATFORMS = [
  { label: "Production", url: DEFAULT_ROOT_URL },
  { label: "Local development", url: "http://localhost:9357" },
];

type Deps = {
  platform: Platform;
  schemas: SchemaStore;
  diagnostics: ManifestDiagnostics;
  refresh: () => void;
};

/** The manifest that a command acts on: the one at an offset, or at the cursor, or the only one. */
type Target = {
  document: vscode.TextDocument;
  manifest: ManifestDocument;
  kind: string;
  name: string;
};

async function documentFor(
  uri?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  if (uri instanceof vscode.Uri) return vscode.workspace.openTextDocument(uri);
  return vscode.window.activeTextEditor?.document;
}

async function targetFor(
  uri?: vscode.Uri,
  offset?: number,
): Promise<Target | undefined> {
  const document = await documentFor(uri);
  if (!document || !ManifestDiagnostics.isManifest(document)) {
    void vscode.window.showWarningMessage("Open a Smarter manifest first.");
    return undefined;
  }
  const manifests = parseManifests(document.getText()).filter(
    (m) => m.isManifest,
  );
  const editor = vscode.window.activeTextEditor;
  const at =
    typeof offset === "number"
      ? offset
      : editor?.document === document
        ? document.offsetAt(editor.selection.active)
        : undefined;
  const manifest =
    (at !== undefined
      ? manifests.find((m) => at >= m.span.start && at <= m.span.end)
      : undefined) ?? manifests[0];
  if (!manifest) return undefined;
  if (manifest.doc.errors.length) {
    void vscode.window.showErrorMessage(
      "The manifest has YAML syntax errors. Fix them first.",
    );
    return undefined;
  }
  const value = manifest.value;
  const metadata =
    isRecord(value) && isRecord(value.metadata) ? value.metadata : undefined;
  const name = typeof metadata?.name === "string" ? metadata.name : undefined;
  if (!manifest.kind || !name) {
    void vscode.window.showErrorMessage(
      "The manifest needs a kind and a metadata.name.",
    );
    return undefined;
  }
  return { document, manifest, kind: manifest.kind, name };
}

function progress<T>(title: string, task: () => Promise<T>): Thenable<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title },
    task,
  );
}

/** Open a manifest in a new, unsaved YAML editor. */
async function openManifest(yaml: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: "yaml",
    content: yaml,
  });
  await vscode.window.showTextDocument(document);
}

export function registerCommands(deps: Deps): vscode.Disposable[] {
  const { platform, schemas, diagnostics } = deps;

  const pickKind = async (placeHolder: string): Promise<string | undefined> => {
    const items = await Promise.all(
      (await schemas.kinds()).map(async (kind) => {
        const example = await schemas.example(kind);
        const metadata = isRecord(example?.metadata)
          ? example.metadata
          : undefined;
        const description = cleanDescription(
          typeof metadata?.description === "string" ? metadata.description : "",
        );
        return { label: kind, detail: description || undefined };
      }),
    );
    return (
      await vscode.window.showQuickPick(items, {
        placeHolder,
        matchOnDetail: true,
      })
    )?.label;
  };

  const resourceCommand = (
    verb: string,
    run: (
      api: SmarterApi,
      kind: string,
      name: string,
    ) => Promise<{ message?: string }>,
    confirm?: (kind: string, name: string) => string,
  ) => {
    return async (uri?: vscode.Uri) => {
      const target = await targetFor(uri);
      if (!target) return;
      const api = await platform.api();
      if (!api) return;
      if (confirm) {
        const answer = await vscode.window.showWarningMessage(
          confirm(target.kind, target.name),
          { modal: true },
          verb,
        );
        if (answer !== verb) return;
      }
      try {
        const result = await progress(
          `${verb} ${target.kind} '${target.name}' on ${platform.host}...`,
          () => run(api, target.kind, target.name),
        );
        log.info(
          `${verb} ${target.kind} ${target.name} on ${api.rootUrl}: ${result.message ?? "ok"}`,
        );
        void vscode.window.showInformationMessage(
          result.message ?? `${verb} ${target.kind} '${target.name}': done.`,
        );
      } catch (error) {
        await platform.reportError(
          `${verb} ${target.kind} '${target.name}'`,
          error,
        );
      }
    };
  };

  return [
    vscode.commands.registerCommand("smarter.newManifest", async () => {
      const kind = await pickKind("The kind of the new manifest");
      if (!kind) return;
      let example = await schemas.example(kind);
      if (!example) {
        try {
          example = (await platform
            .publicApi()
            .exampleManifest(kind)) as Record<string, unknown>;
        } catch (error) {
          await platform.reportError(`Reading the ${kind} example`, error);
          return;
        }
      }
      await openManifest(manifestYaml(example));
    }),

    vscode.commands.registerCommand(
      "smarter.validateOnServer",
      async (uri?: vscode.Uri) => {
        const document = await documentFor(uri);
        if (!document || !ManifestDiagnostics.isManifest(document)) {
          void vscode.window.showWarningMessage(
            "Open a Smarter manifest first.",
          );
          return;
        }
        const api = await platform.api();
        if (!api) return;
        try {
          const count = await progress(
            `Validating on ${platform.host}...`,
            () => diagnostics.validateOnPlatform(document, api),
          );
          if (count === 0)
            void vscode.window.showInformationMessage(
              `${platform.host}: the manifest is valid.`,
            );
          else {
            void vscode.window.showErrorMessage(
              `${platform.host}: the manifest has ${count} error(s).`,
            );
            await vscode.commands.executeCommand(
              "workbench.actions.view.problems",
            );
          }
        } catch (error) {
          await platform.reportError("Validation", error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "smarter.apply",
      async (uri?: vscode.Uri, offset?: number) => {
        const target = await targetFor(uri, offset);
        if (!target) return;
        const errors = vscode.languages
          .getDiagnostics(target.document.uri)
          .filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
        const question = errors.length
          ? `The manifest has ${errors.length} error(s). Apply ${target.kind} '${target.name}' to ${platform.host} anyway?`
          : `Apply ${target.kind} '${target.name}' to ${platform.host}?`;
        const answer = await vscode.window.showWarningMessage(
          question,
          {
            modal: true,
            detail:
              "This creates the resource, or updates it to match the manifest.",
          },
          "Apply",
        );
        if (answer !== "Apply") return;
        const api = await platform.api();
        if (!api) return;
        try {
          const result = await progress(
            `Applying ${target.kind} '${target.name}' to ${platform.host}...`,
            () =>
              api.apply(
                target.document
                  .getText()
                  .slice(target.manifest.span.start, target.manifest.span.end),
              ),
          );
          log.info(
            `apply ${target.kind} ${target.name} on ${api.rootUrl}: ${result.message ?? "ok"}`,
          );
          diagnostics.platform.delete(target.document.uri);
          void vscode.window.showInformationMessage(
            result.message ??
              `Applied ${target.kind} '${target.name}' to ${platform.host}.`,
          );
        } catch (error) {
          await platform.reportError(
            `Apply ${target.kind} '${target.name}'`,
            error,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "smarter.deploy",
      resourceCommand("Deploy", (api, kind, name) => api.deploy(kind, name)),
    ),
    vscode.commands.registerCommand(
      "smarter.undeploy",
      resourceCommand(
        "Undeploy",
        (api, kind, name) => api.undeploy(kind, name),
        (kind, name) => `Undeploy ${kind} '${name}' on ${platform.host}?`,
      ),
    ),
    vscode.commands.registerCommand(
      "smarter.delete",
      resourceCommand(
        "Delete",
        (api, kind, name) => api.delete(kind, name),
        (kind, name) =>
          `Delete ${kind} '${name}' from ${platform.host}? This can't be undone.`,
      ),
    ),

    vscode.commands.registerCommand("smarter.openResource", async () => {
      const api = await platform.api();
      if (!api) return;
      const kind = await pickKind(
        `The kind of resource to open from ${platform.host}`,
      );
      if (!kind) return;
      try {
        const listing = await progress(
          `Reading the ${kind} resources of ${platform.host}...`,
          () => api.get(kind),
        );
        const names = listing.data.items
          .map((item) => item.name)
          .filter((name): name is string => typeof name === "string");
        if (!names.length) {
          void vscode.window.showInformationMessage(
            `${platform.host} has no ${kind} resources that you can read.`,
          );
          return;
        }
        const name = await vscode.window.showQuickPick(names, {
          placeHolder: `The ${kind} to open`,
        });
        if (!name) return;
        const manifest = await progress(`Reading ${kind} '${name}'...`, () =>
          api.describe(kind, name),
        );
        await openManifest(manifestYaml(manifest));
      } catch (error) {
        await platform.reportError(`Reading the ${kind} resources`, error);
      }
    }),

    vscode.commands.registerCommand(
      "smarter.openDocs",
      async (uri?: vscode.Uri) => {
        const document = await documentFor(uri);
        const kind = document
          ? parseManifests(document.getText()).find((m) => m.kind)?.kind
          : undefined;
        const chosen = kind ?? (await pickKind("The kind to read about"));
        if (chosen)
          await vscode.env.openExternal(vscode.Uri.parse(docsUrl(chosen)));
      },
    ),

    vscode.commands.registerCommand("smarter.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: `Smarter API key for ${platform.host}`,
        prompt:
          "The 64-character key of a Smarter API key, from the web console or `smarter configure`.",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim().length < 16
            ? "That is too short to be an API key."
            : undefined,
      });
      if (!key) return;
      const api = new SmarterApi({
        rootUrl: platform.rootUrl,
        apiKey: key.trim(),
        timeout: settings.requestTimeout(),
      });
      try {
        const whoami = await progress(
          `Checking the key on ${platform.host}...`,
          () => api.whoami(),
        );
        await platform.setApiKey(key.trim());
        await platform.refreshAccount();
        void vscode.window.showInformationMessage(
          `Saved the API key of ${whoami.user.username} (account ${whoami.account.accountNumber}) for ${platform.host}.`,
        );
      } catch (error) {
        const answer = await vscode.window.showWarningMessage(
          `${platform.host} didn't accept the key: ${error instanceof Error ? error.message : String(error)}`,
          "Save Anyway",
        );
        if (answer) await platform.setApiKey(key.trim());
      }
    }),

    vscode.commands.registerCommand("smarter.clearApiKey", async () => {
      await platform.clearApiKey();
      const remaining = await platform.apiKey();
      void vscode.window.showInformationMessage(
        remaining?.source === "cli-config"
          ? `Removed the saved key for ${platform.host}. The smarter cli's key for this platform (~/.smarter/config.yaml) is still used.`
          : `Removed the API key for ${platform.host}.`,
      );
    }),

    vscode.commands.registerCommand("smarter.selectPlatform", async () => {
      const current = platform.rootUrl;
      const items: Array<vscode.QuickPickItem & { url?: string }> = [
        ...KNOWN_PLATFORMS.map((p) => ({
          label: p.label,
          description: p.url,
          url: p.url,
          picked: p.url === current,
          detail: p.url === current ? "Current" : undefined,
        })),
        { label: "Other...", description: "Enter a platform url" },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        { label: "$(key) Set API Key...", description: `for ${platform.host}` },
      ];
      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: `Current platform: ${current}`,
      });
      if (!choice) return;
      if (choice.label.startsWith("$(key)")) {
        await vscode.commands.executeCommand("smarter.setApiKey");
        return;
      }
      let url = choice.url;
      if (!url) {
        url = await vscode.window.showInputBox({
          title: "Smarter platform url",
          value: current,
          validateInput: (value) => {
            try {
              const parsed = new URL(value);
              return ["http:", "https:"].includes(parsed.protocol)
                ? undefined
                : "Use an http or https url.";
            } catch {
              return "That isn't a url.";
            }
          },
        });
      }
      if (!url || url === current) return;
      await settings.setRootUrl(url.replace(/\/+$/, ""));
    }),

    vscode.commands.registerCommand("smarter.whoami", async () => {
      const api = await platform.api();
      if (!api) return;
      try {
        const whoami = await progress(`Asking ${platform.host}...`, () =>
          api.whoami(),
        );
        const account = whoami.account;
        void vscode.window.showInformationMessage(
          `${platform.host}: ${whoami.user.username} in account ${account.accountNumber}${account.companyName ? ` (${account.companyName})` : ""}.`,
        );
      } catch (error) {
        await platform.reportError("whoami", error);
      }
    }),

    vscode.commands.registerCommand("smarter.reloadSchemas", () => {
      schemas.clear();
      diagnostics.revalidateAll();
      deps.refresh();
      void vscode.window.showInformationMessage(
        "Smarter: reloaded the schemas.",
      );
    }),
  ];
}
