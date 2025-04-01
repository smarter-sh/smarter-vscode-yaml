"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function activate(context) {
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
function deactivate() {
  console.log("YAML Manifest Extension is now deactivated.");
}
function validateYaml(document, diagnosticCollection) {
  var _a, _b;
  const diagnostics = [];
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
    const line =
      ((_a = error.mark) === null || _a === void 0 ? void 0 : _a.line) || 0;
    const column =
      ((_b = error.mark) === null || _b === void 0 ? void 0 : _b.column) || 0;
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
