# Smarter YAML Manifest Extension for VS Code

This Visual Studio Code extension provides enhanced support for working with proprietary YAML manifest files, similar to Kubernetes manifests. It includes syntax validation, semantic checking, and auto-completion for reserved keywords.

## Features

- **Syntax Validation**: Ensures your YAML files are properly formatted.
- **Semantic Checking**: Validates the content of your YAML manifests against predefined schemas.
- **Auto-Completion**: Provides intelligent suggestions for reserved keywords and properties.
- **Error Highlighting**: Highlights syntax and semantic errors in real-time.
- **Schema Support**: Supports custom schemas for proprietary YAML manifests.

## Getting Started

1. Install the extension from the VS Code Marketplace (or manually if in development).
2. Open a YAML manifest file in VS Code.
3. The extension will automatically validate and provide suggestions.

## Configuration

You can configure the extension by adding the following settings to your `settings.json`:

```json
{
  "yaml.schemas": {
    "path/to/your/schema.json": "*.yaml"
  }
}