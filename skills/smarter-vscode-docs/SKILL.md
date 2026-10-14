---
name: smarter-vscode-docs
description: Use when documenting the smarter-vscode-yaml extension - README.md (which is also its VS Code Marketplace page), the platform's docs page about the extension (../smarter/docs/source/smarter-framework/vs-code-extension.rst, published to docs.smarter.sh), or the extension's architecture decision records in docs/adr/. Covers what goes where, the evergreen-prose rule, keeping the three in step with package.json, and how to check the platform page without its 20-minute build.
---

# Documenting the Extension

| Content                                                 | Where                                                            | Read by                            |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Features, commands, settings, api keys, development     | `README.md`                                                      | Marketplace visitors, contributors |
| What the extension is, how it fits with the cli and SDK | `../smarter/docs/source/smarter-framework/vs-code-extension.rst` | docs.smarter.sh readers            |
| Why the extension is built the way it is                | `docs/adr/NNN-<topic>.md`                                        | Contributors and agents            |
| Release notes                                           | `CHANGELOG.md`, written by semantic-release. Never edit it       | Everyone                           |

## README.md

`vsce` publishes `README.md` as the Marketplace page, and resolves its relative
links against the GitHub repository. So:

- Write for someone deciding whether to install the extension first, and for a
  contributor last (the "Development" section).
- The command table and the settings table must match `package.json`'s
  `contributes.commands` and `contributes.configuration` exactly: titles,
  setting names, defaults. Check them side by side after any change to either.
- Examples are real manifests that validate. Use placeholders (`sk-xxxx`,
  `example.com`), never a real key, account number or private hostname.
- Images must be https urls (the Marketplace rejects svg badges from untrusted
  hosts, and relative image paths break in some views).

## The platform's page

`vs-code-extension.rst` is in the platform's repository, linked from
`apis-and-sdks.rst`, `smarter-resources.rst` and `smarter-openapi.rst`. It
describes the extension for users of the platform, so it is shorter than the
README, and links to it for details. Follow the platform's
`smarter-sphinx-docs` skill (`../smarter/skills/`) for its reST conventions.

- Update it in the same piece of work as a user-visible change, and give the
  user a separate commit command for `../smarter`.
- Kinds, urls and settings in it must be the current ones. Don't list the
  kinds: link to the resource pages, which can't go stale here.
- Check it without the 20-minute build, from `../smarter`:

  ```console
  skills/smarter-sphinx-docs/scripts/check-docs.sh docs/source/smarter-framework/vs-code-extension.rst
  ```

## ADRs

`docs/adr/000-intro.md` has the guidelines and the index. One decision per ADR,
in the same sections as the others (Status, Context, Decision, Alternatives
Considered, Consequences, Related ADRs). When an ADR follows or adapts one of
the platform's ADRs, say so under Status and link it on GitHub. Add the new ADR
to the index in `000-intro.md`. A decision that changes is a new ADR that
supersedes the old one: mark the old one's status "Superseded by ADR-NNN", don't
rewrite its history.

## Writing rules

- **Evergreen prose**, as on the platform: no "New in 0.3" sections. Put a
  feature where its topic belongs. Release notes are `CHANGELOG.md`'s job.
- Say when an action changes a platform (apply, delete, undeploy) or creates
  real infrastructure (deploy).
- Name the setting, command or file exactly as the user sees it: **Smarter:
  Apply Manifest**, `smarterYaml.rootUrl`.
