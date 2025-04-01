"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = require("vscode");
var path = require("path");
var fs = require("fs");
function activate(context) {
    console.log('YAML Manifest Extension is now active!');
    // Register a YAML diagnostics provider for syntax and semantic validation
    var diagnosticCollection = vscode.languages.createDiagnosticCollection('yaml');
    context.subscriptions.push(diagnosticCollection);
    vscode.workspace.onDidChangeTextDocument(function (event) {
        if (event.document.languageId === 'yaml') {
            validateYaml(event.document, diagnosticCollection);
        }
    });
    vscode.workspace.onDidOpenTextDocument(function (document) {
        if (document.languageId === 'yaml') {
            validateYaml(document, diagnosticCollection);
        }
    });
    // Register completion provider for YAML reserved keywords
    var completionProvider = vscode.languages.registerCompletionItemProvider({ language: 'yaml', scheme: 'file' }, {
        provideCompletionItems: function (document, position) {
            var keywords = ['apiVersion', 'kind', 'metadata', 'spec', 'status'];
            return keywords.map(function (keyword) { return new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword); });
        }
    });
    context.subscriptions.push(completionProvider);
}
function deactivate() {
    console.log('YAML Manifest Extension is now deactivated.');
}
function validateYaml(document, diagnosticCollection) {
    var _a, _b;
    var diagnostics = [];
    var text = document.getText();
    try {
        // Basic YAML syntax validation
        var yaml = require('js-yaml');
        yaml.load(text);
        // Add semantic validation here (e.g., schema validation)
        var schemaPath = path.join(__dirname, '../schemas/chatbot-schema.json');
        if (fs.existsSync(schemaPath)) {
            var schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
            // Perform schema validation (use a library like ajv if needed)
        }
    }
    catch (error) {
        var line = ((_a = error.mark) === null || _a === void 0 ? void 0 : _a.line) || 0;
        var column = ((_b = error.mark) === null || _b === void 0 ? void 0 : _b.column) || 0;
        var range = new vscode.Range(line, column, line, column + 1);
        diagnostics.push(new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error));
    }
    diagnosticCollection.set(document.uri, diagnostics);
}
