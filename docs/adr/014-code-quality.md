# ADR-014: Code Quality

## Status

Accepted

Adapts the platform's [ADR-028: Code Quality](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/028-code-quality.rst).

## Context

The platform's standard is its pre-commit hooks. The extension is TypeScript, which the platform's Python hooks don't cover.

## Decision

- `tsc` in `strict` mode is the type standard, and `any` is not used: a value from YAML, JSON or the network is `unknown` until a guard or a contract type narrows it (ADR-003).
- Prettier's defaults are the formatting standard, except for copied and generated files (`.prettierignore`).
- The repository's pre-commit hooks (codespell, JSON and YAML syntax, whitespace, private keys, commitlint) run on every change.

## Alternatives Considered

- ESLint with a large rule set. Most of what it would catch, `strict` already does.

## Consequences

- **Positive:**
  - One standard, checked by tools rather than review.
- **Negative:**
  - Prettier is run with `npx`, not yet a hook.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-003: The Platform's Contract Is the Source](003-contract.md)
