# ADR-005: A Core Without VS Code

## Status

Accepted

## Context

Code that imports `vscode` can only run inside VS Code, so it can only be tested by the slow integration suite. The extension's real logic, parsing YAML with positions, navigating schemas, validating, completing, calling the api, has nothing to do with VS Code's api.

## Decision

- `src/core/` never imports `vscode`. It works with text offsets, paths and plain objects (`Problem`, `Suggestion`), and runs under Node.
- The VS Code layer (`src/extension.ts`, `diagnostics.ts`, `providers.ts`, `commands.ts`, `platform.ts`, `settings.ts`, `log.ts`) converts between those and VS Code's types (`Range`, `Diagnostic`, `CompletionItem`), wires events, and asks the user. It holds no logic that a unit test would need.
- Dependencies that `src/core` needs from VS Code (a `fetch`, a schema source, a clock) are passed in.

## Alternatives Considered

- Test everything through the integration suite. Minutes per run, and hard to reach edge cases.
- Mock the `vscode` module. Brittle, and tests the mock.

## Consequences

- **Positive:**
  - Almost all of the extension is unit tested, in about a second.
  - The same core could serve a language server or another editor later.
- **Negative:**
  - Two layers to keep apart: a reviewer must reject a `vscode` import in `src/core`.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-012: Testing](012-testing.md)
