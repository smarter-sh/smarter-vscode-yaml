---
name: smarter-vscode-ci-failures
description: Use when the user gives a GitHub Actions run or job url of smarter-vscode-yaml (github.com/smarter-sh/smarter-vscode-yaml/actions/runs/<id>, optionally /job/<id>, often with ?pr=<n>) or says a check, the Test workflow or a pull request failed, e.g. a Dependabot pull request that bumps an npm package. Covers fetching the run, its failed step, annotations and log with the bundled script (which survives a stale GH_TOKEN, a missing gh login and GitHub's 502s), what each step of the Test workflow checks, reproducing a dependency bump in a throwaway copy without touching the working tree, fixing it on main so the pull request passes, and reporting.
---

# Investigating a Failed GitHub Actions Run

Adapted from the platform's `smarter-ci-failures`. The user often can't read a
run's log: the browser's download fails, or they're on their phone. Give them
the cause, not the log.

Load `smarter-vscode-development` first. Its rules apply: never run git write
commands (no `gh pr checkout`, no pushing a fix to a Dependabot branch), never
re-run or dispatch a workflow, and run the tests yourself.

## 1. Fetch the run

```console
skills/smarter-vscode-ci-failures/scripts/fetch-run-logs.sh <run url | job url | run id> "$SCRATCHPAD/ci"
```

It prints the run's workflow, branch, commit, pull request, each job and its
failed step, GitHub's annotations (a tsc error's file, line and message), and
the failures pulled out of the log: tsc errors, `node:test` and mocha failures,
npm and vsce errors, and the `##[error]` lines.

It handles what goes wrong when you do this by hand:

- **A stale `GH_TOKEN` in the environment.** It overrides gh's own login, so
  every call fails with 401 "Bad credentials". The script tests each token
  (`gh api rate_limit`), drops the ones GitHub rejects, and says so.
- **No gh login.** It reads `GH_TOKEN` or `GITHUB_TOKEN` from the repository's
  `.env`, without printing it. Never ask the user to `gh auth login`, and never
  print `.env`.
- **No working token at all.** The repository is public, so it falls back to
  the public api: the run, the jobs, the failed step and the annotations, but
  not the log. The annotations are usually enough to name the error; reproduce
  the rest locally (step 3).
- **502s and 503s** from GitHub's api: every call is retried. A 502 is also why
  the user's own download failed: say so.

## 2. Know what failed

`test.yml` (**Test**, on every push to main, alpha and beta, and every pull
request) has one job, `test`, on ubuntu-latest with **node 22**. Its steps:

| Step              | Runs                                   | Its failure usually means                                                                                 |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Install           | `npm ci`                               | `package-lock.json` doesn't match `package.json`, or a package needs a newer node.                        |
| Build             | `npm run build` (tsc, then esbuild)    | A type error. After a `@types/*` bump, the new types are stricter: fix the code, not the types.           |
| Unit tests        | `npm test`                             | A unit test failed. Run it locally; see `smarter-vscode-testing`.                                         |
| Integration tests | `xvfb-run -a npm run test:integration` | A VS Code layer test failed, or VS Code failed to download or start (flaky: check before changing code).  |
| Package           | `npx vsce package`                     | vsce refused: `@types/vscode` newer than `engines.vscode`, a missing README field, or an unexpected file. |

The other workflows (`mergeMain.yml`, `semanticVersionBump.yml`,
`precommitVersionBumps.yml`, `publish.yml`) release, version and publish. Read
their failures, but don't re-run them: publishing is a manual workflow
(`CLAUDE.md`).

## 3. Is it new? Reproduce it

Compare the run's commit with the working tree: `git log --oneline -5` and
`git show --stat <sha>`. A failure in code that main has changed since may be
fixed already.

**A Dependabot pull request** (branch `dependabot/npm_and_yarn/...`) changes
only `package.json` and `package-lock.json`. Reproduce it in a throwaway copy,
so the working tree, the lockfile and git are untouched:

```console
skills/smarter-vscode-ci-failures/scripts/reproduce-dependency.sh <package> <version> "$SCRATCHPAD/repro"
```

It copies the tree (without `.env`, `.git` or `node_modules`), installs the
bumped version, and runs Build and Unit tests. To test a fix, edit the file in
the working tree, then run it again (it copies the tree again), or copy the one
file into the copy.

The fix goes on main, and must work with **both** the old and new version, since
main keeps the old one until the pull request merges. E.g. `@types/node` 26
narrowed `assert.ok`'s message to `string | Error`, so `assert.ok(x, maybe)`
with `maybe: string | undefined` stopped compiling; `maybe ?? "fallback"` works
with both. Once the fix is on main, Dependabot rebases its pull request when the
user comments `@dependabot rebase` on it (or by itself, if the branches
conflict). Tell the user that; don't post the comment.

`@types/vscode` is deliberately ignored by Dependabot (`.github/dependabot.yml`):
it must not be newer than `engines.vscode`. A major bump of anything else is
handled by hand in `monthly-maintenance`.

**A test that passes locally and failed once** in CI may be flaky (the
integration tests download VS Code). Say so, with the evidence, rather than
"fixing" a test that isn't broken.

Then run the whole check as CI does: `npm run build && npm test`, the
integration tests when the VS Code layer changed
(`smarter-vscode-testing`), and the pre-commit hooks on the changed files
(`smarter-code-quality`).

## 4. Report

Lead with the cause in one sentence: which step, which file or test, why it
failed, and whether it is new. Then the fix, how you verified it (with which
versions), and what the user does next: the commit command
(`smarter-git-commits`, never run), and `@dependabot rebase` or a push to re-run
the checks. Don't paste the log; the script's output folder is enough.
