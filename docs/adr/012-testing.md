# ADR-012: Testing

## Status

Accepted

Adapts the platform's [ADR-013: Testing](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/013-testing.rst).

## Context

The extension's value is that its errors are right: a false error teaches users to ignore it, and a missing one lets a broken manifest through. Hand-written fixtures prove only what their author thought of.

## Decision

Three suites:

- **Unit tests** of `src/core` (ADR-005), with Node's test runner, whose data is the bundled contract: every kind's example must validate with no problem, and manifests in tests are derived from the examples. The api client is tested with a fake `fetch`. PyYAML parity is a table of PyYAML's own results.
- **Integration tests** inside a real VS Code (`@vscode/test-electron`): activation, diagnostics at the right ranges, quick fixes, completion, hover, code lenses.
- **A corpus scan** that validates every real manifest in the Smarter repositories (the platform's data, fixtures and docs examples), whose every finding must be a real defect.

Changes that talk to a platform are also tried against the local platform with a throwaway key, and never deploy.

## Alternatives Considered

- Only integration tests. Slow, and they reach few edge cases.
- Hand-written fixtures. They copy the schema's shape, and drift from it.

## Consequences

- **Positive:**
  - False positives are found before users find them; the scan found real defects in the platform's docs and data.
- **Negative:**
  - The corpus scan needs the other repositories checked out beside this one.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-005: A Core Without VS Code](005-core-without-vscode.md)
- [ADR-003: The Platform's Contract Is the Source](003-contract.md)
- [ADR-013: CI/CD](013-ci-cd.md)
