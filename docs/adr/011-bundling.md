# ADR-011: One Bundle

## Status

Accepted

## Context

The extension was compiled with `tsc` and shipped with its `node_modules`, so the package carried every transitive dependency, and VS Code loaded hundreds of files at activation.

## Decision

- esbuild bundles `src/extension.ts` and its dependencies into `dist/extension.js` (`esbuild.mjs`), minified for a release, with `vscode` external.
- `.vscodeignore` excludes everything but the bundle, `contract/sam/`, the icon and the docs. The package is about 230 KB.
- `tsc` only typechecks (`npm run build` runs it first). Tests compile separately into `out/` (`tsconfig.test.json`).

## Alternatives Considered

- `tsc` output plus `node_modules`. Large, slow to load.
- webpack. Slower, and more configuration, for the same result.

## Consequences

- **Positive:**
  - A small package that activates quickly.
- **Negative:**
  - A stack trace from a release points into minified code: reproduce with a development build.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-016: Dependencies](016-dependencies.md)
