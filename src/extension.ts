import * as vscode from "vscode";
import validateYaml from "./validate";
import getSchemaForKind from "./schema";

// Declare diagnosticCollection at the top level
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  console.log("Smarter YAML Manifest Extension is now active.");

  // Initialize the diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection("yaml");
  context.subscriptions.push(diagnosticCollection);

  vscode.workspace.onDidOpenTextDocument(async (document) => {
    if (document.languageId === "yaml" && isSmarterManifest(document)) {
      console.log(
        "onDidOpenTextDocument() validating Smarter Manifest YAML document...",
      );
      await validateYaml(document, diagnosticCollection);
    }
  });

  vscode.workspace.onDidChangeTextDocument(async (event) => {
    const document = event.document;
    if (document.languageId === "yaml" && isSmarterManifest(document)) {
      console.log(
        "onDidChangeTextDocument() re-validating Smarter Manifest YAML document...",
      );
      await validateYaml(document, diagnosticCollection);
    }
  });

  // Register completion provider for YAML reserved keywords
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: "yaml", scheme: "file" },
    {
      provideCompletionItems: async function (document, position) {
        console.log("provideCompletionItems() called.");
        if (!isSmarterManifest(document)) {
          console.log(
            "provideCompletionItems() - Not a Smarter Manifest YAML document.",
          );
          return []; // Skip completion for non-Smarter Manifest YAML files
        }
        console.log(
          "provideCompletionItems() - Validating Smarter Manifest YAML document...",
        );

        const yaml = require("js-yaml");
        const text = document.getText();
        const parsedYaml = yaml.load(text);

        // Extract the `kind` field to determine the schema
        const kind = parsedYaml?.kind;
        if (!kind) {
          console.error("No 'kind' field found in the YAML document.");
          return []; // No `kind` field, no schema-based completions
        }
        console.log(`provideCompletionItems() - Kind found: ${kind}`);

        // Fetch the schema for the given kind
        const schema = await getSchemaForKind(kind);
        if (!schema) {
          console.error(`Schema for kind '${kind}' not found.`);
          return []; // No schema found for the given kind
        }

        // Helper function to recursively generate completion items
        function generateCompletionItems(
          properties: any,
          parentKey: string = "",
        ): vscode.CompletionItem[] {
          console.log(
            "generateCompletionItems() called:",
            properties,
            parentKey,
          );
          return Object.keys(properties).flatMap((property) => {
            const propertyDetails = properties[property];
            const fullKey = parentKey ? `${parentKey}.${property}` : property;

            const completionItem = new vscode.CompletionItem(
              property,
              vscode.CompletionItemKind.Property,
            );

            // Add details like description, type, and examples
            completionItem.detail = propertyDetails.type;
            completionItem.documentation = propertyDetails.description;
            if (propertyDetails.examples) {
              completionItem.documentation += `\nExamples: ${propertyDetails.examples.join(", ")}`;
            }
            completionItem.insertText = property;

            // Recursively process nested properties
            const nestedItems = propertyDetails.properties
              ? generateCompletionItems(propertyDetails.properties, fullKey)
              : [];

            console.log(
              "generateCompletionItems() property details for:",
              property,
              propertyDetails,
            );
            return [completionItem, ...nestedItems];
          });
        }
        // Generate completion items for all levels
        const completionItems = generateCompletionItems(
          schema.properties || {},
        );
        console.log(
          "Completion items generated based on schema properties:",
          completionItems,
        );
        return completionItems;
      },
    },
  );
  context.subscriptions.push(completionProvider);
}

function isSmarterManifest(document: vscode.TextDocument): boolean {
  const text = document.getText();
  const yaml = require("js-yaml");

  try {
    const parsedYaml = yaml.load(text);
    if (parsedYaml && parsedYaml.apiVersion === "smarter.sh/v1") {
      console.log("isSmarterManifest() - is a Smarter Manifest YAML document.");
      return true;
    }
    console.log(
      "isSmarterManifest() - is NOT a Smarter Manifest YAML document.",
    );
    return false;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error parsing YAML document:", error.message);
    } else {
      console.error("Unknown error occurred while parsing YAML document.");
    }
    return false;
  }
}
