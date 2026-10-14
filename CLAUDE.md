# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

smarter-vscode-yaml is the Smarter Manifest extension for VS Code (Marketplace
id `Querium.smarter-manifest`). It validates, completes and documents Smarter's
YAML manifests (`apiVersion: smarter.sh/v1`) as you type, and validates, applies,
deploys and opens them on a Smarter platform through its cli api. The platform
is [smarter-sh/smarter](https://github.com/smarter-sh/smarter), usually checked
out beside this repository as `../smarter`.

Detailed know-how lives in the Agent Skills under `skills/` (symlinked to
`.claude/skills`). **Load `smarter-vscode-development` first for any change.**
This file holds only what applies to nearly every task.

## Hard rules

1. **Never run git write commands**, here or in `../smarter`. "Write a git
   commit" means print the command as text. See `smarter-git-commits`.
2. **Run the tests yourself** after any change (`npm run build && npm test`,
   and the integration tests when the VS Code layer changed). Never ask the
   user to re-run them. Report failures honestly.
3. **Never deploy from a test or a probe.** The local platform's containers
   hold live cloud credentials, and deploy creates real infrastructure.
4. **Never publish** to the Marketplace. That is a manual workflow.
5. **This repository and its Marketplace page are public.** No api keys,
   tokens, account numbers, private hostnames or customer data anywhere. Never
   print `~/.smarter/config.yaml`.
6. **`contract/` and `src/contract/openapi.d.ts` are copied or generated**,
   never edited by hand.
7. **If `NODE_ENV=production` is set**, install with
   `NODE_ENV=development npm install`, or the devDependencies are skipped.

## Repository map

| Path               | Contents                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| `src/core/`        | Everything that doesn't need VS Code: YAML, schemas, validation, the api client     |
| `src/*.ts`         | The VS Code layer: activation, diagnostics, providers, commands, platform, settings |
| `src/test/`        | Unit tests (Node's test runner)                                                     |
| `src/integration/` | Integration tests, inside VS Code                                                   |
| `contract/`        | The platform's api contract: SAM schemas and examples, `openapi.json`               |
| `docs/adr/`        | Architecture decision records                                                       |
| `skills/`          | Agent Skills                                                                        |

## Common commands

```bash
npm run build                                          # typecheck, and bundle into dist/
npm test                                               # unit tests
skills/smarter-vscode-testing/scripts/run-integration.sh   # integration tests in VS Code
make contracts SMARTER_REF=origin/main                 # copy the platform's contract, regenerate the api types
npm run package                                        # build the .vsix
git diff --name-only | xargs venv/bin/pre-commit run --files
```

## Definition of done

- The change follows an existing pattern, and the ADRs in `docs/adr/`.
- Tests cover it, and you ran them; a validation change also passed the corpus scan.
- `tsc` and the pre-commit hooks pass on the changed files.
- `README.md` (and the platform's `vs-code-extension.rst`, for a user-visible change) describe it.
- Your summary says what changed, what you verified, what you skipped, and any platform bugs found.
