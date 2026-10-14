# ADR-016: Dependencies

## Status

Accepted

Adapts the platform's [ADR-015: Dependency Management](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/015-dependency-management.rst).

## Context

Every runtime dependency is bundled into the extension (ADR-011), so it adds to its size and its attack surface. Development tools change often, and some constrain each other.

## Decision

- Runtime dependencies are few: `ajv` and `ajv-formats` (JSON Schema 2020-12) and `yaml` (positions, YAML 1.1). HTTP uses Node's built-in `fetch`. No axios, no js-yaml.
- `@types/vscode` is pinned to the minimum of `engines.vscode` (ADR-018), because `vsce` refuses to package an extension whose types are newer than the VS Code it declares. Dependabot ignores it.
- `openapi-typescript` runs through `npx` at a pinned version, because it wants an older TypeScript as a peer.
- Dependabot proposes updates monthly, and the monthly maintenance updates the rest, retests and repackages.

## Alternatives Considered

- axios and js-yaml, as before. Larger, and js-yaml reads YAML differently from the platform (ADR-006).

## Consequences

- **Positive:**
  - A small bundle, and few packages to keep current.
- **Negative:**
  - Some constraints (the pin, the npx tool) must be remembered: the skills record them.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-011: One Bundle](011-bundling.md)
- [ADR-018: Supported VS Code Versions](018-vscode-versions.md)
