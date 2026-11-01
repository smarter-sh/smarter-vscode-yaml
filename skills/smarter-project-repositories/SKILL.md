---
name: smarter-project-repositories
description: Use when a task in smarter-vscode-yaml reaches into another smarter-sh repository - the platform (../smarter), the smarter cli, the Python, Node.js or Go SDKs, or the manifest repositories example-manifests and stackademy - e.g. to see how the platform or the cli handles a manifest or a cli api call, to check that the corpus scan or a contract sync reads a current checkout, to report a platform bug the extension found, or to answer a question about one of those repositories. Covers reading their local checkouts beside this one, checking that a checkout is current with the bundled script, what the extension takes from each, and the Smarter Project MCP server as a fallback.
---

# The Other Smarter Project Repositories

Adapted from the platform's `smarter-project-repositories`. The platform is the
source of truth for the api and the manifests. The extension consumes it, as the
cli and the SDKs do, and is checked against manifests from several repositories.

## Where to read them, in order

1. **This repository: always the local tree.** It has the working branch and
   uncommitted changes.
2. **The others: their local checkouts**, beside this one at `../<repository>`.
   Grep and read them like local code. First run:

   ```console
   skills/smarter-project-repositories/scripts/repos-status.sh
   ```

   It shows each checkout's branch, uncommitted changes, last commit date, and
   whether it matches its remote. It is read-only (`git ls-remote`, never
   `fetch`). A checkout that is behind can mislead you, e.g. a stale `../smarter`
   makes a contract sync copy an old schema. Say so, and give the user the
   `git -C ../<repository> pull` to run. Don't run it yourself: the
   never-run-git-writes rule applies to every repository.

3. **The Smarter Project MCP server**, only when a checkout is missing or
   hopelessly stale: `../smarter/skills/smarter-project-repositories/scripts/smarter-project-mcp.sh`,
   described in the platform's skill of the same name. It needs a running
   platform. Never write a deployed platform's host into this repository.

Each repository has its own `CLAUDE.md`. Read it before changing anything
there, and follow its rules. Don't edit another repository unless the user asks.

## What the extension takes from each

| Repository          | What it is to the extension                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smarter`           | The platform: the api contract that `make contracts` copies into `contract/` (`smarter-contract-sync`), the local dev server, and its own skills. |
| `smarter-cli`       | The `smarter` command. The extension reads its `~/.smarter/config.yaml` (never print it), and its commands are the model for the extension's.     |
| `smarter-python`    | The Python SDK. Its skills are the model for these; its `tests/data` is in the corpus scan.                                                       |
| `smarter-nodejs`    | The Node.js SDK. Holds the same contract copy.                                                                                                    |
| `smarter-golang`    | The Go SDK. Holds the same contract copy.                                                                                                         |
| `example-manifests` | The example manifests that every platform loads. In the corpus scan.                                                                              |
| `stackademy`        | The Stackademy demo's manifests, which platforms also load. In the corpus scan.                                                                   |

The corpus scan (`smarter-vscode-testing`) validates every manifest in
`smarter`, `example-manifests`, `stackademy` and `smarter-python/tests/data`.
The same problem on many manifests that the platform accepts usually means the
bundled contract is older than the platform, not that the manifests are wrong.

## A bug that belongs elsewhere

The extension often finds bugs in the platform: an example manifest that
doesn't match its schema, a schema that's looser than its Pydantic model, a cli
api response that differs from `openapi.json`. Don't work around them here.
Report each in your summary, with the file and the platform's commit, and, if
the user asks you to fix it, load the platform's `smarter-development` skill
from `../smarter/skills/` and follow its rules there.
