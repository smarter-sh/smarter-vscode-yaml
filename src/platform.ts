/**
 * The Smarter platform that the extension talks to: its url, its api key, and a status bar item
 * that shows which platform and account they are.
 *
 * Api keys are kept in VS Code's SecretStorage (the OS keychain), one per platform url. When there
 * is none, the key that the smarter cli saved for the platform's environment is used.
 */
import * as vscode from "vscode";

import { SmarterApi, SmarterApiError } from "./core/api";
import { cliEnvironment, readCliApiKey } from "./core/cliConfig";
import { log } from "./log";
import { settings } from "./settings";

const SECRET_PREFIX = "smarter.apiKey:";

export type KeySource = "secret-storage" | "cli-config";

export class Platform implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  /** Fires when the platform's url or api key changes. */
  readonly onDidChange = this.onDidChangeEmitter.event;
  private account?: string;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly userAgent: string,
  ) {
    this.statusBar = vscode.window.createStatusBarItem(
      "smarter.platform",
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBar.name = "Smarter Platform";
    this.statusBar.command = "smarter.selectPlatform";
    this.disposables.push(
      this.statusBar,
      this.onDidChangeEmitter,
      context.secrets.onDidChange((e) => {
        if (e.key.startsWith(SECRET_PREFIX)) this.changed();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("smarterYaml.rootUrl")) this.changed();
      }),
    );
    this.render();
  }

  private changed(): void {
    this.account = undefined;
    this.render();
    this.onDidChangeEmitter.fire();
  }

  get rootUrl(): string {
    return settings.rootUrl();
  }

  get host(): string {
    try {
      return new URL(this.rootUrl).host;
    } catch {
      return this.rootUrl;
    }
  }

  /** The api key for the current platform, and where it came from. */
  async apiKey(): Promise<{ key: string; source: KeySource } | undefined> {
    const stored = await this.context.secrets.get(SECRET_PREFIX + this.rootUrl);
    if (stored) return { key: stored, source: "secret-storage" };
    const cli = await readCliApiKey(this.rootUrl);
    if (cli) return { key: cli, source: "cli-config" };
    return undefined;
  }

  async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store(SECRET_PREFIX + this.rootUrl, key);
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_PREFIX + this.rootUrl);
  }

  /** A client of the platform, without an api key, for its public endpoints. */
  publicApi(): SmarterApi {
    return new SmarterApi({
      rootUrl: this.rootUrl,
      timeout: settings.requestTimeout(),
      userAgent: this.userAgent,
    });
  }

  /**
   * A client of the platform with its api key. Without a key, offer to set one, and return
   * undefined if none is set.
   */
  async api(): Promise<SmarterApi | undefined> {
    let key = await this.apiKey();
    if (!key) {
      const choice = await vscode.window.showWarningMessage(
        `Smarter needs an API key for ${this.host}.`,
        "Set API Key",
        "Select Platform",
      );
      if (choice === "Set API Key")
        await vscode.commands.executeCommand("smarter.setApiKey");
      if (choice === "Select Platform")
        await vscode.commands.executeCommand("smarter.selectPlatform");
      key = await this.apiKey();
      if (!key) return undefined;
    }
    return new SmarterApi({
      rootUrl: this.rootUrl,
      apiKey: key.key,
      timeout: settings.requestTimeout(),
      userAgent: this.userAgent,
    });
  }

  /** Report a failed request, and offer to fix an invalid api key. */
  async reportError(action: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`${action} failed on ${this.rootUrl}: ${message}`);
    if (error instanceof SmarterApiError && error.isUnauthorized) {
      const choice = await vscode.window.showErrorMessage(
        `${action} failed: ${message} Check your API key for ${this.host}.`,
        "Set API Key",
      );
      if (choice) await vscode.commands.executeCommand("smarter.setApiKey");
      return;
    }
    const choice = await vscode.window.showErrorMessage(
      `${action} failed: ${message}`,
      "Show Log",
    );
    if (choice) log.show();
  }

  /** Read the api key's account, to show in the status bar. */
  async refreshAccount(): Promise<void> {
    const key = await this.apiKey();
    if (!key) {
      this.account = undefined;
      this.render();
      return;
    }
    try {
      const whoami = await new SmarterApi({
        rootUrl: this.rootUrl,
        apiKey: key.key,
        timeout: settings.requestTimeout(),
        userAgent: this.userAgent,
      }).whoami();
      this.account = `${whoami.user.username} @ ${whoami.account.accountNumber}`;
    } catch (error) {
      this.account = undefined;
      log.warn(`whoami failed on ${this.rootUrl}: ${String(error)}`);
    }
    this.render();
  }

  /** Show or hide the status bar item: it is shown while a manifest is the active editor. */
  setVisible(visible: boolean): void {
    if (visible) this.statusBar.show();
    else this.statusBar.hide();
  }

  private render(): void {
    this.statusBar.text = `$(cloud) Smarter: ${this.host}`;
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**Smarter platform**: ${this.rootUrl}  \n`);
    tooltip.appendMarkdown(
      `cli environment: \`${cliEnvironment(this.rootUrl)}\`  \n`,
    );
    tooltip.appendMarkdown(
      this.account
        ? `Account: ${this.account}  \n`
        : "No account verified yet.  \n",
    );
    tooltip.appendMarkdown("\nClick to select another platform.");
    this.statusBar.tooltip = tooltip;
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
