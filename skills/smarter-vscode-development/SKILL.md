---
name: smarter-vscode-development
description: Start here for any change to smarter-vscode-yaml, the Smarter Manifest VS Code extension (Marketplace id Querium.smarter-manifest) that validates, completes and applies Smarter's YAML manifests. Gives the non-negotiable rules, the architecture (src/core without VS Code, the VS Code layer, the bundled api contract, PyYAML parity), the patterns for adding a command, a setting, a validation rule or a cli api call, the known traps, and an index of the narrower skills to load for each kind of work.
---

# Smarter Manifest Extension Development

The extension is to Smarter manifests what Red Hat's YAML extension is to
Kubernetes manifests, plus the `smarter` cli's commands: it validates a manifest
as you type, completes and documents its keys, fixes common mistakes, and
validates, applies, deploys and opens resources on a Smarter platform.

The platform is [smarter-sh/smarter](https://github.com/smarter-sh/smarter),
usually checked out beside this repository as `../smarter`. Its local dev server
is `http://localhost:9357`. The extension's sibling clients are the
[smarter cli](https://github.com/smarter-sh/smarter-cli) and the Python SDK,
`../smarter-python`, and the platform's web console has a Monaco manifest editor
(`../smarter/smarter/react/packages/smarter-manifest-editor`) that does some of
the same things in the browser.

## Repository map

| Path                            | What lives there                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/extension.ts`              | `activate()`: creates the services and registers everything with VS Code                   |
| `src/core/`                     | **No `vscode` import.** Everything that can be unit tested in Node (ADR-005)               |
| `src/core/yamlDoc.ts`           | Parsing (PyYAML parity), offsets ↔ paths, the completion context                          |
| `src/core/schema.ts`            | Navigating a kind's JSON Schema: `$ref`, `anyOf`, properties at a path, hover markdown     |
| `src/core/validate.ts`          | `validateText()`: Ajv 2020 errors grouped into `Problem`s, unknown keys, quick fix data    |
| `src/core/completion.ts`        | Key and value suggestions, as snippet text                                                 |
| `src/core/schemaStore.ts`       | Schemas and examples: platform first, bundled fallback, caching (ADR-004)                  |
| `src/core/api.ts`               | `SmarterApi`, the cli api client, typed by `src/contract/openapi.d.ts`                     |
| `src/core/cliConfig.ts`         | Reads the smarter cli's api key from `~/.smarter/config.yaml`                              |
| `src/core/docs.ts`              | Each kind's page on docs.smarter.sh                                                        |
| `src/diagnostics.ts`            | The two diagnostic collections, debouncing, platform validation                            |
| `src/providers.ts`              | Completion, hover, quick fix and code lens providers                                       |
| `src/commands.ts`               | Every `smarter.*` command                                                                  |
| `src/platform.ts`               | The platform url, api keys (SecretStorage, cli config), the status bar item                |
| `src/settings.ts`, `log.ts`     | Settings, read fresh on every use, and the "Smarter" log output channel                    |
| `src/contract/openapi.d.ts`     | **Generated** from `contract/openapi.json`. Never edit by hand                             |
| `contract/`                     | **Copied** from the platform: `openapi.json`, `sam/<Kind>.schema.json` and `.example.json` |
| `src/test/`, `src/integration/` | Unit tests (Node's test runner) and integration tests (inside VS Code)                     |
| `scripts/sync-contracts.sh`     | Copies the platform's contract into `contract/`                                            |
| `esbuild.mjs`                   | Bundles `src/extension.ts` into `dist/extension.js`                                        |
| `docs/adr/`                     | The extension's architecture decision records                                              |
| `skills/`                       | These skills (`.claude/skills` is a symlink to it)                                         |

The extension's user documentation is `README.md` (it is also the Marketplace
page) and the platform's page
`../smarter/docs/source/smarter-framework/vs-code-extension.rst`. See
`smarter-vscode-docs`.

## Non-negotiable rules

1. **Never execute git write commands**, here or in `../smarter`. "Write a git
   commit" means output the command text. See `smarter-git-commits`.
2. **Run the tests yourself** after every change: `npm run build`, `npm test`,
   and `npm run test:integration` when the VS Code layer changed. Never ask the
   user to re-run them. Report failures honestly. See `smarter-vscode-testing`.
3. **Never deploy from a test or a probe.** `deploy` creates real, billable
   infrastructure, and the local platform's containers hold live cloud
   credentials (see `smarter-infrastructure-safety` in `../smarter/skills/`).
   Apply and delete only throwaway resources you created, and delete them.
4. **The pre-commit hooks are the lint standard**, with `tsc` and Prettier. See
   `smarter-code-quality`.
5. **This repository is public**, and so is the Marketplace page. No api keys,
   tokens, account numbers, private hostnames or customer data in code,
   fixtures, docs or skills. The smarter cli's config file holds real keys:
   never print it.
6. **The contract is copied, never edited.** `contract/` comes from the
   platform (`smarter-vscode-contract`), and `src/contract/openapi.d.ts` is
   generated from it.
7. **Parse manifests only with `parseManifests()`** (or `PARSE_OPTIONS`). The
   platform reads YAML with PyYAML (YAML 1.1). Any other parser or option set
   disagrees with it about values such as `02139`, `yes` or `2026-12-31`
   (ADR-006).
8. **No `any`.** `strict` is on. A value from YAML, JSON or the network is
   `unknown` until a guard (`isRecord()`) or a contract type narrows it. Types
   of api responses come from `openapi.d.ts`, never hand-written shapes
   (ADR-003, which follows the platform's ADR-031).
9. **Every platform request has a timeout, and no automatic one prompts.**
   Validation as you type must never wait on, or nag about, the network.

## Architecture, and why

Each decision is recorded in `docs/adr/`. Read the ADR before you change one,
and add an ADR when you make a new decision of that size.

- **`src/core` never imports `vscode`** (ADR-005), so validation, completion,
  YAML positions, the api client and the schema store run under `node --test`
  in a second. The VS Code files convert offsets to `Range`s and `Problem`s to
  `Diagnostic`s, and nothing more.
- **The platform's committed contract is the source** (ADR-003): each kind's
  JSON Schema and example manifest, and `openapi.json`. Nothing is hand-copied.
- **Schemas come from the platform first** (`smarterYaml.schemaSource`), so they
  match the version that the manifest will be applied to, and fall back to the
  bundled copies offline. A failure is remembered for a minute, so an offline
  editor doesn't retry on every keystroke (ADR-004).
- **Two diagnostic collections** (ADR-007): `smarter`, the JSON Schema checks as
  you type, and `smarter-platform`, the platform's own `validate`, which runs on
  demand or on save and is cleared as soon as the text changes.
- **Unknown keys are warnings, not errors.** Pydantic ignores undeclared keys,
  and the schemas don't forbid them, so a misspelled key would otherwise be
  silently dropped. `isClosedMapping()` decides which mappings are checked:
  dict fields (`additionalProperties`) and free-form objects never are.
- **The platform gets the YAML text**, `application/x-yaml`, exactly as the cli
  sends it, so validate and apply see what PyYAML sees (ADR-006).
- **Writes go through the cli api** with a modal confirmation: apply, undeploy
  and delete. There are no REST writes (ADR-008).
- **Api keys** live in VS Code's SecretStorage, one per platform url, with the
  smarter cli's config file as the fallback. Never in settings (ADR-009).
- **One bundle** (ADR-011): esbuild writes `dist/extension.js`, and the package
  holds only it, `contract/sam/`, the icon and the docs.

## Patterns

Copy the nearest existing example of each; they are consistent.

**A command**

1. `package.json`: `contributes.commands` (title, `category: "Smarter"`, an
   icon if it goes in a toolbar), and `menus` with a `when` clause:
   `smarter.isManifest` for a command that acts on the open manifest.
2. `src/commands.ts`: register it in `registerCommands()`. A command on the
   open manifest uses `targetFor()`; one that writes asks with a modal
   `showWarningMessage` first; a platform call runs inside `progress()` and
   reports errors with `platform.reportError()`.
3. Add it to the integration test's list of registered commands, and to the
   command table in `README.md`.

**A setting**

1. `package.json`: `contributes.configuration.properties["smarterYaml.<name>"]`,
   with a `markdownDescription`.
2. `src/settings.ts`: an accessor that reads it on every call. A change of any
   `smarterYaml.*` setting already clears the schemas and revalidates.
3. The settings table in `README.md`.

**A validation rule**

1. `src/core/validate.ts`: a `Problem` with a stable `code`, the span of the
   exact key or value, and `data` if a quick fix can repair it.
2. A quick fix: a `ProblemData` variant, and its `case` in
   `QuickFixProvider` (`src/providers.ts`).
3. Unit tests in `src/test/validate.test.ts`, and then the corpus scan, which
   runs the validator over every real manifest in the Smarter repositories
   (`smarter-vscode-testing`). A rule that flags a valid manifest is a bug.

**A cli api call**

1. Check the operation in `contract/openapi.json`, and probe it on the local
   platform (`smarter-api-testing`).
2. A method of `SmarterApi` (`src/core/api.ts`), typed with `Ok<"operation_id">`
   and the contract's schemas. Every cli operation is a `POST`.
3. A unit test with `fakeFetch()` in `src/test/platform.test.ts`.

## Traps already found

- **`NODE_ENV=production` in the user's shell** makes npm skip devDependencies:
  `tsc`, `esbuild` and `vsce` go missing. Install with
  `NODE_ENV=development npm install`.
- **TypeScript 6 no longer includes `@types` by itself**: `tsconfig.json` lists
  `"types": ["node", "vscode"]`.
- **`@types/vscode` must not be newer than `engines.vscode`**, or `vsce`
  refuses to package. It is pinned, and Dependabot ignores it. Raise both
  together (ADR-016).
- **`openapi-typescript` wants TypeScript 5** as a peer, so it runs through
  `npx` at a pinned version (`npm run contract:types`), not as a dependency.
- **Prettier must not format `contract/` or `src/contract/openapi.d.ts`**
  (`.prettierignore`), or they stop matching their source.
- **VS Code's integrated terminal sets `ELECTRON_RUN_AS_NODE`**, which makes the
  integration tests' VS Code start as plain Node ("bad option" errors).
- **Pydantic is more lenient than JSON Schema.** It accepts a date for a
  datetime: `date-time` is redefined in `validate.ts` to match. Check such a
  difference against the platform before you report it as a manifest error.
- **15 platform fields list their choices only in their description** (e.g.
  a Guardrail's `stage`), not as an `enum`, so the extension can't complete or
  check them. The fix belongs in the platform's SAM models (`Literal[...]`).
- **Only `https://ubc.smarter.sh` is a live public platform.**
  `platform.smarter.sh` doesn't resolve, and `smarter.sh` is the marketing site.
  Check a host before you add it to `KNOWN_PLATFORMS` or the docs.

## Which skill to load

| Task                                                           | Skill                     |
| -------------------------------------------------------------- | ------------------------- |
| Unit, integration or corpus tests                              | `smarter-vscode-testing`  |
| The platform's contract changed, a new kind, regenerated types | `smarter-vscode-contract` |
| README, the platform's docs page, ADRs                         | `smarter-vscode-docs`     |
| Probing the platform's cli api by hand                         | `smarter-api-testing`     |
| Lint, format, pre-commit                                       | `smarter-code-quality`    |
| Writing a commit message                                       | `smarter-git-commits`     |
| The monthly sync with the platform, and the dependency update  | `monthly-maintenance`     |

When a task leads into the platform itself, e.g. to fix a bug that the extension
found, load the platform's skills from `../smarter/skills/`, starting with
`smarter-development`.

## Releasing

semantic-release (`release.config.js`, the `mergeMain.yml` workflow) versions a
release from the commit types on `main`. Publishing to the Marketplace is the
manual `publish.yml` workflow (`vsce publish`, with the `VSCE_PAT` secret).
Never publish yourself. `npm run package` builds the `.vsix` locally.

## Definition of done

- The change follows an existing pattern, and the ADRs in `docs/adr/`.
- Unit tests cover it, and you ran `npm run build`, `npm test`, and the
  integration tests if the VS Code layer changed. A validation change also
  passed the corpus scan.
- A change that talks to the platform was tried against the local platform.
- The pre-commit hooks pass on the changed files.
- `README.md` and, for a user-visible change, the platform's
  `vs-code-extension.rst` describe it.
- Your summary says what changed, what you verified, what you skipped, and any
  platform bugs found.
