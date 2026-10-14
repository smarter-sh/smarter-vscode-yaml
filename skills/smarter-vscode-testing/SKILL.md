---
name: smarter-vscode-testing
description: Use when writing, fixing or running the smarter-vscode-yaml extension's tests - the unit tests of src/core (Node's test runner, src/test/*.test.ts), the integration tests inside VS Code (@vscode/test-electron, src/integration/suite.ts), or the corpus scan that validates every real Smarter manifest to find false positives. Covers the commands, the helpers and fixtures, why the bundled contract is the test data, testing the api client with a fake fetch, and the traps (NODE_ENV, ELECTRON_RUN_AS_NODE, activation timing).
---

# Testing the Extension

Three suites, from fast to slow (ADR-012). Run the ones that cover your change,
yourself, and report their real counts.

| Suite       | Command                                                                                    | What it proves                                                                          |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Unit        | `npm test`                                                                                 | `src/core`: parsing, positions, validation, completion, the api client, caching         |
| Integration | `skills/smarter-vscode-testing/scripts/run-integration.sh` (or `npm run test:integration`) | The VS Code layer: activation, diagnostics, quick fixes, completion, hover, code lenses |
| Corpus scan | `node skills/smarter-vscode-testing/scripts/scan-manifests.js`                             | No false positives on the ~280 real manifests in the Smarter repositories               |

Always run `npm run build` too: it typechecks all of `src/`, which `npm test`
compiles only in part.

## Unit tests

- `src/test/*.test.ts`, with `node:test` and `node:assert/strict`. No mocha,
  no jest. `npm test` compiles `src/core`, `src/test` and `src/integration`
  into `out/` (`tsconfig.test.json`) and runs `out/test/**/*.test.js`.
- They import only `src/core`, which has no `vscode` import (ADR-005). If a
  test needs `vscode`, the code under test belongs in `src/core`, or the test
  belongs in the integration suite.
- **The bundled contract is the test data** (`src/test/helpers.ts`): `KINDS`,
  `schemaOf(kind)`, `exampleOf(kind)`, `exampleYaml(kind)`, and `validate(text)`
  with the bundled schemas. Write a manifest inline as a string, or derive it
  from a kind's example with `.replace()`, so it follows the contract when the
  contract changes. Don't add YAML fixtures that copy a schema's shape.
- Every kind's example must validate with no problem. That test runs for each
  kind in `contract/sam/`, so a new kind is covered by a sync.
- Assert positions with `spanText(text, problem)`, the text that the problem
  underlines, not with offsets.
- The api client takes a `fetch`. Test it with `fakeFetch(status, body, calls)`
  (`src/test/platform.test.ts`), and assert the url, method, headers and body
  in `calls`. No test reaches the network.
- PyYAML parity has a table in `src/test/yaml11.test.ts`, made with PyYAML's
  `yaml.safe_load`. To add a case, ask PyYAML, not your memory:

  ```console
  python3 -c "import yaml; print(repr(yaml.safe_load('a: 0o17')['a']))"
  ```

## Integration tests

`src/integration/suite.ts` runs inside a real VS Code, with the extension loaded
from `dist/` and `smarterYaml.schemaSource` set to `bundled`, so it needs no
platform. It drives VS Code through its own commands:
`vscode.executeCompletionItemProvider`, `executeHoverProvider`,
`executeCodeActionProvider`, `executeCodeLensProvider`, and
`languages.getDiagnostics()`.

- It's a plain list of `test(name, fn)` with a small runner, not mocha. Keep it
  that way unless it grows past a screenful of tests.
- **Wait, don't sleep.** Activation is lazy (`onLanguage:yaml`) and validation
  is debounced, so use `waitFor(what, probe)` for activation and diagnostics.
- Tests share one document and run in order. A test that edits it says so in
  its name.
- `npm run test:integration` downloads VS Code into `.vscode-test/`, and the
  download can time out. `run-integration.sh` uses the installed VS Code and
  unsets `ELECTRON_RUN_AS_NODE`, which VS Code's integrated terminal sets. On
  Linux CI the suite runs under `xvfb-run` (`.github/workflows/test.yml`).

## The corpus scan

The validator must not flag a manifest that the platform accepts. Before you
finish any change to `src/core/validate.ts`, `schema.ts` or `yamlDoc.ts`:

```console
npm run compile-tests
node skills/smarter-vscode-testing/scripts/scan-manifests.js > "$SCRATCHPAD/scan.txt"
```

Read every line, grouped by code. A problem is either:

- **a real defect in the manifest**: a deliberately invalid test fixture
  (`*-bad*.yaml`, `*-invalid.yaml`), or a real bug in the platform's data or
  docs, which you report in your summary, or
- **a false positive**, which you fix here, with a unit test.

When unsure, ask the platform: validate the file with
`POST /api/v1/cli/validate/` (`smarter-api-testing`), or parse it with PyYAML.
At the time of writing, the scan reports only real defects: invalid test
fixtures, three docs examples that PyYAML can't parse, and two built-in data
files with an empty `spec.config`.

## Against the local platform

A change to `src/core/api.ts`, the schema store, or a command that calls the
platform needs one real run against the local platform. See
`smarter-api-testing`, and its `probe-platform.js`.

## Traps

- `NODE_ENV=production` in the shell: npm skips devDependencies, and `tsc` is
  missing. `NODE_ENV=development npm install`.
- `npm test` runs the compiled tests in `out/`. A stale `out/` from a deleted
  test still runs: `rm -rf out` if a test you removed still appears.
- The integration suite tests `dist/extension.js`: run `npm run build` first.
  The npm script and `run-integration.sh` both do.
