# ADR-018: Supported VS Code Versions

## Status

Accepted

## Context

A higher `engines.vscode` gives the extension newer apis, and leaves out users of older VS Code, VSCodium and editors built on VS Code (Cursor, Windsurf), which often lag behind.

## Decision

`engines.vscode` is `^1.101.0`, and `@types/vscode` is pinned to `1.101.0` (ADR-016), so the code can't use a newer api by accident. Both are raised together, only when the extension needs a newer api, and the integration tests run on the current VS Code.

## Alternatives Considered

- Track the latest VS Code. Leaves out editors built on VS Code.

## Consequences

- **Positive:**
  - Works in most editors built on VS Code.
- **Negative:**
  - Newer apis wait for a deliberate raise.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-016: Dependencies](016-dependencies.md)
