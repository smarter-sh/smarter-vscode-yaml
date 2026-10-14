---
name: smarter-code-quality
description: Use before finishing any change to smarter-vscode-yaml, to typecheck, format and lint it - tsc (strict, via npm run build), Prettier, and the repository's pre-commit hooks (codespell, JSON/YAML checks, whitespace, private keys, commitlint). Explains which tools are authoritative, which files must never be formatted, and how to run the hooks on changed files under zsh.
---

# Code Quality

Three checks, all required (ADR-014):

| Check      | Command                                     | Standard                                                               |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Types      | `npm run build` (runs `tsc --noEmit` first) | `tsconfig.json`: `strict`, no `any` (see `smarter-vscode-development`) |
| Formatting | `npx --yes prettier@3.6.2 --write <files>`  | Prettier's defaults: 80 columns, double quotes, trailing commas        |
| Hooks      | `pre-commit run --files <files>`            | `.pre-commit-config.yaml`                                              |

If a check fails, fix the code. Never bypass a hook (`--no-verify`, `SKIP=`), and
never silence `tsc` with `any`, `// @ts-ignore` or a non-null `!` that you
haven't proven.

## Prettier

Prettier is not a dependency or a hook here yet, so run a pinned version with
`npx`, on the files you changed:

```console
git diff --name-only --diff-filter=AM -- '*.ts' '*.mjs' '*.js' '*.json' '*.md' | xargs npx --yes prettier@3.6.2 --write
git ls-files --others --exclude-standard -- '*.ts' '*.mjs' '*.js' '*.json' '*.md' | xargs npx --yes prettier@3.6.2 --write
```

`.prettierignore` keeps it off `contract/`, `src/contract/openapi.d.ts` and
`CHANGELOG.md`, which must stay byte-identical to what produced them. Don't
pass those files to it explicitly either.

## The pre-commit hooks

From the repository root:

```console
source venv/bin/activate        # make init creates it
git diff --name-only --diff-filter=AM | xargs pre-commit run --files
git ls-files --others --exclude-standard | xargs pre-commit run --files
```

- Use `xargs`. Under zsh, `pre-commit run --files $FILES` passes one argument,
  and pre-commit checks nothing.
- `--diff-filter=AM` leaves out deleted files, which pre-commit can't read.
- **codespell** runs on everything. A test that misspells a word on purpose
  (e.g. `descripton`, to test the "did you mean" fix) needs the word in
  `codespell.txt`, one per line. So does a word inside a regular expression
  (`[Ff]alse` reads as `alse`). Add real project words there too.
- The hooks also check JSON and YAML syntax, end-of-file newlines, trailing
  whitespace, merge markers, private keys and AWS credentials, and commitlint
  checks commit messages (`smarter-git-commits`).
- The `eslint` hook targets a `client/` folder that doesn't exist: it never
  runs. There is no ESLint configuration for `src/`.

## Principles

- Match the surrounding code: its naming, its comment density, its doc comments
  (`/** One sentence that says what it is or does. */`, explaining why where it
  isn't obvious), and its error handling (`SmarterApiError`,
  `platform.reportError()`).
- A comment explains a decision or a trap, not what the next line does.
- Don't reformat code you didn't otherwise change. It buries the real diff.
