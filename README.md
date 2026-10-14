# Smarter Manifest for VS Code

A [Visual Studio Code extension](https://marketplace.visualstudio.com/items/?itemName=Querium.smarter-manifest) for [Smarter](https://smarter.sh) manifests: the YAML files that declare Smarter resources such as LLMClients, Plugins, Guardrails, Secrets and Custom Domains. Any YAML file whose `apiVersion` is `smarter.sh/v1` is a manifest:

```yaml
apiVersion: smarter.sh/v1
kind: Secret
metadata:
  name: openai_api_key
  description: The OpenAI API key of the support LLMClient.
  version: 1.0.0
spec:
  config:
    value: sk-xxxx
```

## Features

### Validation as you type

Each manifest is validated against its kind's JSON Schema, which the platform generates from the same Pydantic models that `smarter apply` validates with. Problems are underlined at the exact key or value they are about:

- YAML syntax errors, and values of the wrong type, e.g. `metadata.description: Must be string or null.`
- missing required keys, e.g. `Missing required key 'version' in metadata.`
- values outside their allowed set, e.g. `Must be one of: "hour", "day", "week", "month".`
- unknown kinds and misspelled keys, with a suggestion: `Unknown key 'descripton' in metadata. Did you mean 'description'?` The platform ignores most unknown keys, so a misspelled setting would otherwise be silently dropped.

YAML is read the way the platform reads it (YAML 1.1, as PyYAML does), so `postalCode: 02139` is a string here too, and a date such as `2026-12-31` is accepted where Pydantic accepts it. A file can hold several manifests, separated by `---`.

### Quick fixes

Press `Ctrl+.` (`Cmd+.` on macOS) on a problem to fix it: rename a misspelled key or kind, pick one of a value's allowed choices, or add a missing required key.

### Completion and help

- Completion of the keys that the mapping at the cursor may have, required keys first, laid out for their type: a nested mapping opens on the next line, and a key with a fixed set of values offers them as choices.
- Completion of values: `kind`, `apiVersion`, enums and booleans.
- Hover over a key for its type, whether it is required, its description and default. Hover over the kind for a link to its documentation.
- In an empty YAML file, type `smarter` to insert the example manifest of any kind.

### Work with your Smarter platform

With an API key, the extension runs the Smarter cli api's commands for the manifest in the editor:

| Command (Command Palette, `Smarter:`) | What it does                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Validate Manifest on Platform**     | Validates the manifest with the platform's own validation, as `apply` would, without saving it. Finds what a JSON Schema can't, such as a field that depends on another. |
| **Apply Manifest**                    | Creates the resource, or updates it to match the manifest, after you confirm.                                                                                            |
| **Deploy / Undeploy Resource**        | Deploys or undeploys the manifest's resource, for the kinds that deploy.                                                                                                 |
| **Delete Resource**                   | Deletes the manifest's resource, after you confirm.                                                                                                                      |
| **Open Resource from Platform...**    | Picks a kind and a resource, and opens its manifest in a new editor.                                                                                                     |
| **New Manifest...**                   | Opens a new manifest of any kind, from the platform's example.                                                                                                           |
| **Open Documentation for This Kind**  | Opens the kind's page on [docs.smarter.sh](https://docs.smarter.sh).                                                                                                     |
| **Select Platform...**                | Switches between production, a local development platform, or any other url.                                                                                             |
| **Set API Key... / Remove API Key**   | Saves or removes the API key for the current platform.                                                                                                                   |
| **Show Account (whoami)**             | Shows the user and account of the API key.                                                                                                                               |
| **Reload Schemas**                    | Reads the schemas again, e.g. after the platform is upgraded.                                                                                                            |

Validate, Apply and the kind's docs are also links above each manifest, and the status bar shows which platform the extension talks to.

### API keys

API keys are kept in VS Code's secret storage (your operating system's keychain), one per platform. If you use the [smarter cli](https://github.com/smarter-sh/smarter-cli), you don't need to enter one: the extension uses the key that `smarter configure` saved in `~/.smarter/config.yaml` for the platform's environment (`local` for `http://localhost:9357`, `prod` otherwise, or `alpha`, `beta` and `next` for urls that start with them).

## Settings

| Setting                      | Default                  | Description                                                                                                                                                    |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smarterYaml.rootUrl`        | `https://ubc.smarter.sh` | The Smarter platform's url, e.g. `http://localhost:9357` for a local development platform.                                                                     |
| `smarterYaml.schemaSource`   | `platform`               | `platform` reads each kind's schema from the platform, so it matches the version you apply to, and falls back to the bundled schemas. `bundled` works offline. |
| `smarterYaml.validateOnSave` | `false`                  | Also validate on the platform when you save a manifest. Needs an API key.                                                                                      |
| `smarterYaml.unknownKeys`    | `warning`                | How to report a key that the schema doesn't declare: `warning`, `information` or `off`.                                                                        |
| `smarterYaml.codeLens`       | `true`                   | Show the Validate, Apply and docs links above each manifest.                                                                                                   |
| `smarterYaml.requestTimeout` | `10000`                  | Timeout of a request to the platform, in milliseconds.                                                                                                         |

The extension's log is in the **Output** panel, under **Smarter**.

## The Smarter api contract

The extension is built on the api contract that the Smarter platform publishes in [`smarter/smarter/apps/api/v1/contract/`](https://github.com/smarter-sh/smarter/tree/main/smarter/smarter/apps/api/v1/contract), and copies it into [`contract/`](contract/):

- `contract/sam/<Kind>.schema.json`: the JSON Schema of every kind, bundled with the extension for offline use. They are the same schemas that each platform serves at `/api/v1/cli/json-schema/<Kind>/`.
- `contract/sam/<Kind>.example.json`: an example manifest of every kind, for New Manifest and the `smarter` completions.
- `contract/openapi.json`: the OpenAPI document of the Smarter api, from which [`src/contract/openapi.d.ts`](src/contract/openapi.d.ts) is generated, so that the extension's api client is typed by the contract.

## Development

Requires Node.js 20 or later. If your shell sets `NODE_ENV=production`, npm skips devDependencies: install with `NODE_ENV=development npm install`.

```console
npm install
npm run build              # typecheck, and bundle src/ into dist/extension.js with esbuild
npm test                   # unit tests, with Node's test runner
npm run test:integration   # integration tests, in VS Code
npm run package            # build smarter-manifest-<version>.vsix
```

Press `F5` in VS Code to run the extension in an Extension Development Host.

`npm run test:integration` downloads VS Code. To use an installed one, set `VSCODE_EXECUTABLE_PATH`, e.g. `/Applications/Visual Studio Code.app/Contents/MacOS/Code`. Run it from a terminal outside VS Code, or unset `ELECTRON_RUN_AS_NODE`, which VS Code's integrated terminal may set.

After the platform's contract changes, copy it from a checkout of [smarter](https://github.com/smarter-sh/smarter), then regenerate the api types and run the tests:

```console
scripts/sync-contracts.sh ../smarter [git ref, e.g. origin/main]
npm run contract:types
npm test
```

The code is in `src/`: `core/` has the parts that don't depend on VS Code (YAML positions, schema navigation, validation, completion, the api client), which the unit tests in `test/` exercise, and the rest wires them into VS Code.
