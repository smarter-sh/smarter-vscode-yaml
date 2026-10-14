---
name: monthly-maintenance
description: Use when asked to do smarter-vscode-yaml's monthly maintenance, or either half of it - (1) bring the extension back in step with the Smarter platform by reviewing the platform's commits since the extension last followed it, syncing the api contract, and changing the extension, its tests and docs as needed, and (2) update the npm dependencies, retest, repackage, and, if everything passes, write a "fix" git commit. Covers finding the baseline, reading the delta by area, the dependency rules (the @types/vscode pin, major versions), and the commit messages.
---

# Monthly Maintenance

The extension follows a platform that changes every week. Once a month, this
maintenance brings it back in step, and keeps its dependencies current. Two
parts, in this order, each with its own commit, so that the retest of part 2
covers part 1 too.

Load `smarter-vscode-development` first. Its rules apply throughout: **never
run git write commands** (write the commit command as text,
`smarter-git-commits`), **never deploy**, and run the tests yourself.

Work from this repository's root, with the platform checked out at `../smarter`
and its local dev server running (`make run` in `../smarter`).

## Part 1: Follow the platform

### 1. Find the delta

```console
skills/monthly-maintenance/scripts/smarter-delta.sh
```

It fetches the platform (`git fetch` updates only its remote-tracking
branches), and lists the platform's commits on `origin/main` since a baseline,
grouped by what they mean for the extension. The baseline is the later of the
platform at the date of the extension's last release tag, and the commit named
by the newest `Synced with smarter <sha>` line in this repository's history,
which each maintenance commit records. Pass a base as the third argument to
override it: `smarter-delta.sh ../smarter origin/main <sha>`.

### 2. Sync the contract

```console
make contracts SMARTER_REF=origin/main
npm run build && npm test
```

Then read the diff, as `smarter-vscode-contract` says: a new or removed kind
needs `src/core/docs.ts`, a new cli operation may deserve a command.

### 3. Review each area

For each area with changes, read the diffs, not only the subjects:
`git -C ../smarter diff <base>..origin/main -- <path>`.

| Area in the report            | What to check, and what to change here                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Api contract                  | Synced in step 2                                                                                                     |
| SAM manifest models           | New `Literal`s (completion picks them up), renamed fields (users' manifests break: say so in the README)             |
| Cli api views and urls        | Changed responses or errors: `src/core/api.ts` and its fake-fetch tests                                              |
| Request body parsing          | The platform still reads YAML with PyYAML `safe_load`? If not, ADR-006 and `PARSE_OPTIONS` change                    |
| Authentication                | The `Authorization: Token` header, a new scheme                                                                      |
| Resource docs pages           | A page added, renamed or removed: `PAGES` in `src/core/docs.ts` (its test checks every kind has one)                 |
| The extension's docs page     | Someone edited it on the platform: keep the edit, and keep `README.md` consistent                                    |
| The console's manifest editor | A feature users now expect here too, e.g. locked fields, a new check                                                 |
| ADRs                          | A platform ADR that one of `docs/adr/` follows changed                                                               |
| Skills                        | A platform skill that one here adapts changed (`smarter-git-commits`, `smarter-api-testing`, `smarter-code-quality`) |
| Lint standard                 | Hooks or `codespell.txt` changed                                                                                     |

The smarter cli (`../smarter-cli`) is a separate repository. If its config file
format changed (`cmd/root.go`, `cmd/api.go`), `src/core/cliConfig.ts` follows.

### 4. Test

```console
npm run build && npm test
skills/smarter-vscode-testing/scripts/run-integration.sh
npm run compile-tests && node skills/smarter-vscode-testing/scripts/scan-manifests.js > "$SCRATCHPAD/scan.txt"
SMARTER_API_KEY=<throwaway key> node skills/smarter-api-testing/scripts/probe-platform.js --write
```

The corpus scan and the probe matter most here: they're how a platform change
shows up as a false positive or a broken call. Compare the scan's counts per
code with last month's (they're in the last maintenance commit).

### 5. Commit

Write the commit command (never run it), following `smarter-git-commits`: `fix`
when the extension's behavior changes for users (new kinds, corrected
validation), `chore(contract)` when only the bundled files changed. The body
lists the platform commits each change follows, the scan's counts, and ends with
this line, which the next run's baseline reads:

```text
Synced with smarter <full sha of the platform ref you synced with>
```

Get the sha with `git -C ../smarter rev-parse origin/main`. Changes to
`../smarter` (its docs page) get their own commit command, for that repository.
If nothing concerns the extension, there is no commit: report the range you
reviewed.

## Part 2: Update the dependencies

### 1. See what is outdated

```console
NODE_ENV=development npm outdated
gh pr list --author app/dependabot     # read-only: Dependabot's open pull requests
```

### 2. Update

- **Within the ranges:** `NODE_ENV=development npm update`.
- **A new major version:** raise it in `package.json` only after reading its
  release notes, and only if the tests pass with it. Otherwise keep the current
  major, and report why.
- **`@types/vscode` stays pinned** to `engines.vscode`'s minimum. Raise both
  together, and only when the extension needs a newer VS Code api (ADR-018).
  Dependabot ignores it on purpose.
- **`typescript`**: a new major can change defaults (TypeScript 6 stopped
  including `@types` by itself). Read `tsc`'s output carefully.
- **`openapi-typescript`** isn't a dependency: bump the pinned version in the
  `contract:types` script, regenerate, and check that `openapi.d.ts`'s diff is
  only formatting.
- **Runtime dependencies** (`ajv`, `ajv-formats`, `yaml`) are bundled into
  `dist/`. A new major of `yaml` can change how scalars resolve: the PyYAML
  parity table (`src/test/yaml11.test.ts`) is the check.
- After the updates, close the Dependabot PRs that the commit supersedes, or
  tell the user which ones.

### 3. Retest

```console
NODE_ENV=development npm install
npm run build && npm test
skills/smarter-vscode-testing/scripts/run-integration.sh
npm run package                       # the .vsix builds, and vsce accepts engines vs @types/vscode
```

If something fails, fix the extension when the fix is small and clearly right,
otherwise keep that package's previous version, retest, and report the failure
with its output.

### 4. Commit

Only when everything passes:

```console
git commit --author="Claude <noreply@anthropic.com>" \
  -m "fix(deps): update the npm dependencies" \
  -m "Monthly maintenance: every dependency is at its latest version within the rules in ADR-016." \
  -m "- esbuild 0.28.2 -> 0.28.4
- ..." \
  -m "Held back: <package> <version>, because <reason>." \
  -m "Tests: npm test (96 passed), integration (7 passed), npm run package." \
  -m "Co-authored-by: Lawrence McDaniel <lpm0073@gmail.com>"
```

`fix` makes semantic-release cut a patch release. List every version change,
and the real test counts. If nothing was outdated, there is no commit.

## Report

End with a summary: the platform range reviewed and what changed because of it,
platform changes deliberately not followed and why, platform bugs found, the
dependency updates and any held back (with the failing output), every suite's
results, and the commit commands, one per repository and part.
