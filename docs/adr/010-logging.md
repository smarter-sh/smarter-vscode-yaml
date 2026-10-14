# ADR-010: Logging

## Status

Accepted

Adapts the platform's [ADR-011: Logging](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/011-logging.rst).

## Context

Users need to see why a schema came from the bundle, or why a platform call failed, without a debugger. `console.log` in an extension goes to the developer tools, where users don't look.

## Decision

- The extension logs to one `LogOutputChannel`, **Smarter** in the Output panel (`src/log.ts`), whose level the user sets with VS Code's own Set Log Level.
- It logs platform calls and their failures, schema sources, and the platform url. It never logs api keys or manifest contents.
- An error shown to the user offers **Show Log** when the log says more.

## Alternatives Considered

- `console.log`. Invisible to users.

## Consequences

- **Positive:**
  - One place to look, with levels.
- **Negative:**
  - None of note.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-019: Error Handling](019-error-handling.md)
