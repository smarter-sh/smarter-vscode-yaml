/** The extension's settings, read fresh on every use so that a change applies without a reload. */
import * as vscode from "vscode";

import type { SchemaSource } from "./core/schemaStore";
import type { Severity } from "./core/validate";

export const SECTION = "smarterYaml";
export const DEFAULT_ROOT_URL = "https://ubc.smarter.sh";

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION);
}

export const settings = {
  rootUrl(): string {
    return (config().get<string>("rootUrl") || DEFAULT_ROOT_URL)
      .trim()
      .replace(/\/+$/, "");
  },
  schemaSource(): SchemaSource {
    return config().get<SchemaSource>("schemaSource") ?? "platform";
  },
  validateOnSave(): boolean {
    return config().get<boolean>("validateOnSave") ?? false;
  },
  unknownKeys(): Severity | "off" {
    return config().get<Severity | "off">("unknownKeys") ?? "warning";
  },
  codeLens(): boolean {
    return config().get<boolean>("codeLens") ?? true;
  },
  requestTimeout(): number {
    return Math.max(1000, config().get<number>("requestTimeout") ?? 10000);
  },
  async setRootUrl(url: string): Promise<void> {
    // keep the setting where it is, e.g. in the workspace's settings.json.
    const inspect = config().inspect<string>("rootUrl");
    const target =
      inspect?.workspaceFolderValue !== undefined
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : inspect?.workspaceValue !== undefined
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
    await config().update("rootUrl", url, target);
  },
};
