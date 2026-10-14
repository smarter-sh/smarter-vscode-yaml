# ADR-019: Error Handling

## Status

Accepted

Adapts the platform's [ADR-012: Error Handling](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/012-error-handling.rst).

## Context

Errors come from the platform (the journal's error envelope, with a status), from the network, and from broken documents. A language feature that throws breaks the editor's experience; a command that fails silently leaves the user guessing.

## Decision

- The api client raises one error type, `SmarterApiError`, with the platform's error description, its status (0 for a network failure or a timeout), and whether it was a 401 or 403.
- Commands report failures with `platform.reportError()`: the message, and an action that fixes it (Set API Key) or explains it (Show Log).
- Language features (validation, completion, hover, code lenses) never throw to VS Code and never show a message: they log, and return nothing.
- A document with a syntax error is still a manifest (its `apiVersion` line says so), and its errors are reported.

## Alternatives Considered

- Raw `fetch` errors. Their messages say nothing about the platform's reason.

## Consequences

- **Positive:**
  - Every failure says what went wrong and what to do.
- **Negative:**
  - None of note.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-010: Logging](010-logging.md)
- [ADR-007: Two Kinds of Diagnostics](007-diagnostics.md)
