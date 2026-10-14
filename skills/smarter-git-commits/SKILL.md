---
name: smarter-git-commits
description: Use whenever the user asks you to "write a git commit" (or a commit message, or the git add) in the smarter-vscode-yaml repository. Covers the never-execute rule, authorship, the multiple -m command format, conventional-commit types and this repository's scopes, which types trigger a Marketplace release, and how thorough the body must be.
---

# Git Commits

This is the platform's `smarter-git-commits` skill (`../smarter/skills/`),
adapted to the extension. Its canonical example,
`../smarter/skills/smarter-git-commits/references/canonical-git-commit.md`, shows
the depth that a body must have.

## The rule: write, never execute

"Write a git commit", in any wording or tone, means **output the command as
text**. It never means run it.

- Never execute `git commit`, `git add`, `git reset`, `git restore --staged`,
  `git push`, `git stash`, `git pull`, or any other git command that writes, in
  this repository or in `../smarter`. The user stages and commits themselves.
- Read-only git commands (`git status`, `git diff`, `git log`) are fine.
- Don't volunteer commit messages. Write one only when asked.

## Authorship

You are the author. Lawrence McDaniel is the co-author.

- `--author="Claude <noreply@anthropic.com>"`
- The last `-m` is `Co-authored-by: Lawrence McDaniel <lpm0073@gmail.com>`.

## Command format

Exactly one `git commit` command in one code block:

```console
git commit --author="Claude <noreply@anthropic.com>" \
  -m "<type>(<scope>): <subject>" \
  -m "<body paragraph>" \
  -m "<body paragraph or bullet list>" \
  -m "Co-authored-by: Lawrence McDaniel <lpm0073@gmail.com>"
```

- One `-m` per paragraph. git joins them with blank lines.
- No heredoc, no `-F`, and no `git add` in the same block.
- No backticks, `$` or `!` inside the double-quoted messages. The user's shell
  is zsh, where `!` in double quotes is history expansion and aborts the
  command. Reword instead.
- When the user asks for the `git add` too, write it as a separate code block,
  with explicit paths. A deleted file is staged with `git add` too (or
  `git rm`). Leave out files that don't belong to the change.
- A change that also edits `../smarter` (e.g. its `vs-code-extension.rst`) gets
  a second command, for that repository, with `git -C ../smarter`.

## Subject line

`<type>(<scope>): <subject>`, checked by commitlint (`commitlint.config.js`:
config-conventional and config-angular) and read by semantic-release
(`release.config.js`).

- **type:** `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `style`, `build`,
  `ci` or `chore`. **`feat` and `fix` release a new version**, which is then
  published to the Marketplace by hand. Use them only for a change that users
  of the extension see. A skill, an ADR, a test or a CI change is `docs`,
  `test` or `ci`, and releases nothing.
- **scope:** the area, in lower case: `validation`, `completion`, `hover`,
  `quickfix`, `commands`, `platform`, `api`, `contract`, `schemas`, `settings`,
  `build`, `deps`, `skills`, `adr`. Omit it for a change across the whole
  repository.
- **subject:** imperative mood, lower case, no trailing period.
- **length:** the whole header must be **72 characters or fewer**. commitlint
  rejects 73. Measure it, don't count by eye, and aim for 70:

  ```console
  printf %s "feat(validation): report misspelled keys, with did-you-mean fixes" | wc -c
  ```

- `chore(release): ...` belongs to semantic-release. Never write it.

## Body

Write for a reviewer six months from now, with no context. A terse body is
rejected.

- Start with the problem or motivation, as a user saw it.
- Then area by area: a heading paragraph per area (e.g.
  `Validation (src/core/validate.ts):`), then one bullet per change, with the
  reason for each non-obvious choice.
- Name files, settings (`smarterYaml.unknownKeys`), commands (**Smarter: Apply
  Manifest**) and platform endpoints precisely.
- Cover the tests, by what they prove, with their real counts (unit,
  integration, corpus scan).
- Say whether the contract was synced, and from which platform commit.
- End with the current status: skips, platform bugs found, follow-ups.

## Before writing

1. `git status` and `git diff --stat` (and `git diff` on anything unclear), so
   the message describes the working tree, not your memory of it.
2. Ask which files belong to the commit if that's ambiguous.
3. Measure the header with `wc -c`.
4. Start the response with a one-line `Written for:` audience note.
