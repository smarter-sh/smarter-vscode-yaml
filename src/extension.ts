import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
  console.log("YAML Manifest Extension is now active!");

  // Register a YAML diagnostics provider for syntax and semantic validation
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("yaml");
  context.subscriptions.push(diagnosticCollection);

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "yaml") {
      validateYaml(event.document, diagnosticCollection);
    }
  });

  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === "yaml") {
      validateYaml(document, diagnosticCollection);
    }
  });

  // Register completion provider for YAML reserved keywords
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: "yaml", scheme: "file" },
    {
      provideCompletionItems(document, position) {
        const keywords = ["apiVersion", "kind", "metadata", "spec", "status"];
        return keywords.map(
          (keyword) =>
            new vscode.CompletionItem(
              keyword,
              vscode.CompletionItemKind.Keyword,
            ),
        );
      },
    },
  );
  context.subscriptions.push(completionProvider);
}

export function deactivate() {
  console.log("YAML Manifest Extension is now deactivated.");
}

function validateYaml(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
) {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();

  try {
    // Basic YAML syntax validation
    const yaml = require("js-yaml");
    yaml.load(text);

    // Add semantic validation here (e.g., schema validation)
    const schemaPath = path.join(__dirname, "../schemas/chatbot-schema.json");
    if (fs.existsSync(schemaPath)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      // Perform schema validation (use a library like ajv if needed)
    }
  } catch (error) {
    const line = error.mark?.line || 0;
    const column = error.mark?.column || 0;
    const range = new vscode.Range(line, column, line, column + 1);
    diagnostics.push(
      new vscode.Diagnostic(
        range,
        error.message,
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }

  diagnosticCollection.set(document.uri, diagnostics);
}
