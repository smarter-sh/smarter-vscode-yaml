---
name: smarter-vscode-contract
description: Use when the Smarter platform's api contract changes and the extension must follow it - a new, renamed or removed SAM kind, a changed manifest schema or example, a new or changed cli operation in openapi.json - or when a test says the bundled contract is out of date. Covers scripts/sync-contracts.sh, regenerating src/contract/openapi.d.ts, what else a new kind touches (docs links, README), how to read the diff, and which problems belong in the platform rather than here.
---

# Following the Platform's Contract

The platform publishes its api as files in
`../smarter/smarter/smarter/apps/api/v1/contract/`, generated from its Pydantic
models (the platform's `smarter-api-contract` skill). The extension copies them,
and never edits them (ADR-003):

| Here                               | From the platform         | Used for                                                                |
| ---------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `contract/sam/<Kind>.schema.json`  | `sam/<Kind>.schema.json`  | Bundled schemas: offline validation, the fallback, the unit tests' data |
| `contract/sam/<Kind>.example.json` | `sam/<Kind>.example.json` | New Manifest, the `smarter` completions, the unit tests                 |
| `contract/openapi.json`            | `openapi.json`            | `src/contract/openapi.d.ts`, the api client's types                     |

Each platform also serves its own schemas at `/api/v1/cli/json-schema/<Kind>/`,
which the extension prefers (ADR-004). They are the same files, so the bundled
copies only need to be as new as the platform version most users run.

## Sync

From the repository root:

```console
scripts/sync-contracts.sh ../smarter origin/main   # read at a ref, with git show; the checkout isn't changed
npm run contract:types                             # regenerate src/contract/openapi.d.ts
npm run build && npm test
```

Without a ref, the script copies the checkout's working tree, which may hold
someone's unreleased work. Sync with the ref that users run, normally
`origin/main`. `make contracts SMARTER_REF=origin/main` runs both steps.

The script replaces `contract/sam/` as a whole, so a removed kind's files go
away. The `contract` unit test ("bundles a schema and an example of every kind
in the OpenAPI document") fails when `contract/sam/` and `openapi.json`'s
`SAMKind` disagree.

## Read the diff

```console
git diff --stat -- contract/ src/contract/
git diff -- contract/sam/
```

| Change                             | What to do here                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A new kind                         | Its docs page in `src/core/docs.ts` (`PAGES`), and the kind list nowhere else: completion, New Manifest and validation read `contract/sam/` |
| A removed or renamed kind          | `docs.ts`; a renamed kind is a breaking change for users' manifests, say so in the commit and the README                                    |
| A changed schema or example        | Nothing, unless a test fails. Every example must still validate with no problem                                                             |
| A new `enum` where there was prose | Nothing: completion and quick fixes pick it up                                                                                              |
| A new or changed cli operation     | `npm run build` shows what no longer typechecks in `src/core/api.ts`. A new operation that users want becomes a method and a command        |
| A changed error envelope           | `SmarterApi.post()`'s error handling, and its fake-fetch tests                                                                              |

Then run the corpus scan (`smarter-vscode-testing`): a schema change can make
real manifests fail.

## Problems that belong in the platform

The extension can only be as precise as the schemas. Report these, don't work
around them here:

- **Choices only in prose.** A field whose description says "One of: [...]" but
  whose type is `str` has no `enum`, so it can't be completed or checked. The
  fix is a `Literal[...]` in the platform's SAM model. To list them:

  ```console
  python3 - <<'EOF'
  import json, glob, re
  for f in sorted(glob.glob("contract/sam/*.schema.json")):
      def walk(n, path):
          if isinstance(n, dict):
              d = n.get("description", "")
              if isinstance(d, str) and re.search(r"[Oo]ne of", d) and "enum" not in n:
                  print(f.split("/")[-1], ".".join(path))
              for k, v in n.items():
                  walk(v, path + [k])
          elif isinstance(n, list):
              for v in n:
                  walk(v, path)
      walk(json.load(open(f)), [])
  EOF
  ```

- **An example that doesn't validate** against its own schema: the platform's
  contract tests should catch it, so it means the platform's export is stale.
- **A default server or url that doesn't resolve** in `openapi.json`.

## Don'ts

- Don't edit `contract/` or `src/contract/openapi.d.ts` by hand, and don't
  let Prettier format them (`.prettierignore`).
- Don't add `openapi-typescript` to `package.json`: it wants TypeScript 5 as a
  peer, so `contract:types` runs a pinned version through `npx`.
- Don't hard-code a list of kinds anywhere. `SchemaStore.kinds()` reads
  `contract/sam/`.
