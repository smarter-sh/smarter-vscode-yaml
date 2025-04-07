import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats"; // Import the formats plugin
import * as vscode from "vscode";
import { getSchemaForKind } from "./schema";

export default async function validateYaml(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
) {
  console.log("Validating YAML document...");
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();

  try {
    const yaml = require("js-yaml");
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const parsedYaml = yaml.load(text);

    console.log("validatedYaml()");
    console.log("-".repeat(80));
    if (parsedYaml && parsedYaml.kind) {
      const kind = parsedYaml.kind;
      const schema = await getSchemaForKind(kind);

      if (schema) {
        const validate = ajv.compile(schema);
        console.log("Validating YAML document against schema...");

        if (!validate(parsedYaml)) {
          validate.errors?.forEach((error: ErrorObject) => {
            const errorPath = error.instancePath.split("/").slice(1); // Remove leading slash
            const line = text
              .split("\n")
              .findIndex((line) =>
                line.includes(errorPath[0] ?? error.message ?? ""),
              );
            const range =
              line >= 0
                ? new vscode.Range(line, 0, line, text.split("\n")[line].length)
                : new vscode.Range(0, 0, 0, 1);

            diagnostics.push(
              new vscode.Diagnostic(
                range,
                `Schema validation error: ${error.message}`,
                vscode.DiagnosticSeverity.Error,
              ),
            );
          });
        }
      } else {
        const line = text
          .split("\n")
          .findIndex((line) => line.trim().startsWith("kind"));
        const range =
          line >= 0
            ? new vscode.Range(line, 0, line, text.split("\n")[line].length)
            : new vscode.Range(0, 0, 0, 1);

        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Schema for kind '${kind}' not found.`,
            vscode.DiagnosticSeverity.Warning,
          ),
        );
      }
    } else {
      const line = text
        .split("\n")
        .findIndex((line) => line.trim().startsWith("kind"));
      const range =
        line >= 0
          ? new vscode.Range(line, 0, line, text.split("\n")[line].length)
          : new vscode.Range(0, 0, 0, 1);

      diagnostics.push(
        new vscode.Diagnostic(
          range,
          "Missing 'kind' field in the manifest.",
          vscode.DiagnosticSeverity.Error,
        ),
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      const line = (error as any).mark?.line || 0;
      const column = (error as any).mark?.column || 0;
      const range = new vscode.Range(line, column, line, column + 1);
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          error.message,
          vscode.DiagnosticSeverity.Error,
        ),
      );
    } else {
      console.error("An unknown error occurred:", error);
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
}
