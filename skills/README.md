# smarter-vscode-yaml Agent Skills

This folder holds the [Agent Skills](https://agentskills.io/specification) for
working on the Smarter Manifest VS Code extension with an AI coding agent such
as Claude Code. This README is written mostly for people.

A skill is a folder of written know-how that an agent loads only when a task
needs it. Each one contains a `SKILL.md` file, and sometimes a `scripts/`
folder. These skills cover how this repository is built, tested, documented
and committed. They are developer tooling, like the `Makefile` and
`.pre-commit-config.yaml`. They aren't packaged into the extension
(`.vscodeignore` excludes them), and no extension code reads them.

They are adapted from the Smarter platform's skills, in
[smarter-sh/smarter/skills](https://github.com/smarter-sh/smarter/tree/main/skills),
and follow the Python SDK's adaptation of them, in
[smarter-sh/smarter-python/skills](https://github.com/smarter-sh/smarter-python/tree/main/skills),
so that the platform and its clients are developed the same way. The platform's
skills that only concern the platform (Django apps, migrations, Docker
containers, the React console, courses, the blog) aren't copied here. Load them
from `../smarter/skills/` when a task leads into the platform, e.g. to fix a bug
that the extension found.

## What's here

Start with `smarter-vscode-development`. It sets out the rules that apply to
every change, the extension's architecture, the patterns for common changes,
and which narrower skill to load for each kind of task.

| Skill                        | Use it when                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `smarter-vscode-development` | You're making any change. Start here.                                               |
| `smarter-vscode-testing`     | You're writing or running the unit, integration or corpus tests.                    |
| `smarter-vscode-contract`    | The platform's api contract changed, or a test says the bundled contract is stale.  |
| `smarter-vscode-docs`        | You're editing the README, the platform's docs page about the extension, or an ADR. |
| `smarter-api-testing`        | You're trying the extension's api calls against a real platform.                    |
| `smarter-code-quality`       | You're about to finish a change, and need to typecheck, format and run the hooks.   |
| `smarter-git-commits`        | You've been asked to write a commit message.                                        |
| `monthly-maintenance`        | It's time to follow the platform, and update the dependencies.                      |

The bundled scripts are ordinary scripts that you can run yourself from the
repository root:

- `smarter-vscode-testing/scripts/scan-manifests.js` validates every Smarter
  manifest in the repositories beside this one, to find false positives.
- `smarter-vscode-testing/scripts/run-integration.sh` runs the integration
  tests in your installed VS Code, from any terminal.
- `smarter-api-testing/scripts/probe-platform.js` runs the extension's api
  client against a platform. With `--write` it applies and deletes a throwaway
  Secret.
- `monthly-maintenance/scripts/smarter-delta.sh` lists the platform's commits
  since the extension last followed it, grouped by what they mean here.

The architecture decisions that the skills refer to are in
[docs/adr/](../docs/adr/000-intro.md).

## Claude Code

Claude Code looks for project skills in `.claude/skills/`. This repository
connects the two folders with a committed symlink, `.claude/skills -> ../skills`,
as the platform's repository does:

```bash
mkdir -p .claude
ln -s ../skills .claude/skills
```

`CLAUDE.md` at the repository root tells it to load `smarter-vscode-development`
first. Other agents that read `SKILL.md` folders can be pointed at this folder,
or told to read `skills/smarter-vscode-development/SKILL.md` at the start of a
session.

## When to add or change a skill

Add to a skill when you've explained the same thing to an agent twice, when a
mistake is costly (e.g. a probe that deploys real infrastructure, or a release
that vsce refuses to package), when a pattern isn't obvious from the code, or
when checking a change takes a fragile series of steps that a script could run.
Don't add one for what the code, `tsc`, the hooks or CI already enforce, for
one-off facts, or for personal preferences. Prefer editing an existing skill to
adding one, keep each `SKILL.md` short, and add a new one to the table above and
to the index in `smarter-vscode-development`.

When the platform changes a convention that a skill here copies, update the
skill here too. `monthly-maintenance` checks for that.

## Security considerations

A skill is a set of instructions that an agent follows, often without asking.
**Review a change to this folder as carefully as a change to CI.**

- **The local platform is live.** The probes run against the platform in
  `../smarter`, whose containers hold credentials for real cloud
  infrastructure. The skills forbid deploying from tests and probes. Don't
  weaken that.
- **Your own api keys are real.** The extension reads the smarter cli's
  `~/.smarter/config.yaml`, which may hold production keys. The skills tell
  agents to use throwaway keys, and never to print that file.
- **Some instructions forbid things on purpose**, e.g. never running
  `git commit`, or publishing to the Marketplace. Don't remove a rule like that
  unless you mean to give agents that power.
- **Skills can carry prompt injection.** Look for instructions unrelated to a
  skill's purpose, new scripts with network calls, and text that tells an agent
  to skip confirmations, hooks or safety rules.
- **Keep secrets out.** This repository and its Marketplace page are public: no
  api keys, tokens, account numbers, private hostnames or customer data in a
  skill, an example or a script.
