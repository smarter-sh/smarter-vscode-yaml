/**
 * Integration tests, run inside VS Code by @vscode/test-electron (npm run test:integration):
 * activation, diagnostics, completion, hover, quick fixes and commands, with the bundled schemas.
 */
import assert from "node:assert/strict";
import * as vscode from "vscode";

const MANIFEST = `apiVersion: smarter.sh/v1
kind: Budget
metadata:
  name: example_budget
  descripton: a typo
  version: 1.0.0
spec:
  config:
    period: fortnight
`;

async function waitFor<T>(
  what: string,
  probe: () => T | undefined,
  timeout = 10000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const tests: Array<[string, () => Promise<void>]> = [];
function test(name: string, run: () => Promise<void>) {
  tests.push([name, run]);
}

let document: vscode.TextDocument;

test("activates on a YAML file and registers its commands", async () => {
  await vscode.workspace
    .getConfiguration("smarterYaml")
    .update("schemaSource", "bundled", true);
  document = await vscode.workspace.openTextDocument({
    language: "yaml",
    content: MANIFEST,
  });
  await vscode.window.showTextDocument(document);
  const extension = vscode.extensions.getExtension("Querium.smarter-manifest");
  assert.ok(extension, "the extension is installed");
  await waitFor("activation", () => (extension.isActive ? true : undefined));
  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "smarter.newManifest",
    "smarter.apply",
    "smarter.validateOnServer",
    "smarter.setApiKey",
  ]) {
    assert.ok(commands.includes(command), command);
  }
});

test("reports schema problems at their exact positions", async () => {
  const diagnostics = await waitFor("diagnostics", () => {
    const list = vscode.languages
      .getDiagnostics(document.uri)
      .filter((d) => d.source === "smarter");
    return list.length >= 2 ? list : undefined;
  });
  const typo = diagnostics.find((d) => d.code === "unknown-key");
  assert.ok(typo, JSON.stringify(diagnostics));
  assert.equal(document.getText(typo.range), "descripton");
  const period = diagnostics.find((d) => d.code === "schema-enum");
  assert.ok(period);
  assert.equal(document.getText(period.range), "fortnight");
  assert.equal(period.severity, vscode.DiagnosticSeverity.Error);
});

test("offers quick fixes", async () => {
  const typo = vscode.languages
    .getDiagnostics(document.uri)
    .find((d) => d.code === "unknown-key")!;
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    document.uri,
    typo.range,
    vscode.CodeActionKind.QuickFix.value,
  );
  const fix = actions.find((a) => a.title === "Change to 'description'");
  assert.ok(fix, actions.map((a) => a.title).join(", "));
  assert.ok(await vscode.workspace.applyEdit(fix.edit!));
  assert.match(document.getText(), /^ {2}description: a typo$/m);
});

test("completes the keys of the mapping at the cursor", async () => {
  const line = document.getText().split("\n").indexOf("    period: fortnight");
  const position = new vscode.Position(line + 1, 4);
  const editor = vscode.window.activeTextEditor!;
  await editor.edit((e) =>
    e.insert(new vscode.Position(line + 1, 0), "    \n"),
  );
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    document.uri,
    position,
  );
  const labels = list.items.map((item) =>
    typeof item.label === "string" ? item.label : item.label.label,
  );
  for (const key of ["unit", "action"])
    assert.ok(labels.includes(key), `${key} in ${labels.join(", ")}`);
  assert.ok(!labels.includes("period"), "period is already there");
});

test("documents a key on hover", async () => {
  const offset = document.getText().indexOf("period:");
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    document.positionAt(offset + 2),
  );
  const text = hovers
    .flatMap((h) => h.contents)
    .map((c) => (typeof c === "string" ? c : "value" in c ? c.value : ""))
    .join("\n");
  assert.match(text, /\*\*period\*\*/);
  assert.match(text, /spec\.config\.period/);
});

test("shows code lenses above the manifest", async () => {
  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    document.uri,
  );
  const commands = lenses.map((lens) => lens.command?.command);
  assert.ok(commands.includes("smarter.validateOnServer"));
  assert.ok(commands.includes("smarter.apply"));
});

test("ignores YAML that isn't a manifest", async () => {
  const other = await vscode.workspace.openTextDocument({
    language: "yaml",
    content: "apiVersion: v1\nkind: Pod\nfoo: [\n",
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.deepEqual(
    vscode.languages
      .getDiagnostics(other.uri)
      .filter((d) => d.source === "smarter"),
    [],
  );
});

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const [name, body] of tests) {
    try {
      await body();
      console.log(`  ✔ ${name}`);
    } catch (error) {
      console.log(
        `  ✖ ${name}\n    ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      failures.push(name);
    }
  }
  console.log(
    `${tests.length - failures.length} passed, ${failures.length} failed`,
  );
  if (failures.length)
    throw new Error(`${failures.length} integration test(s) failed`);
}
