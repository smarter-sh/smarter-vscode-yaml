# ADR-013: CI/CD

## Status

Accepted

Follows the platform's [ADR-014: CI/CD](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/014-ci-cd.rst).

## Context

Every change should be built and tested the same way, and every release versioned and published the same way.

## Decision

GitHub Actions only, as on the platform. `test.yml` builds, runs the unit tests, the integration tests (under `xvfb-run`), and packages the `.vsix`, on every push and pull request. Releases are versioned by semantic-release (ADR-015) when `main` changes. Publishing to the Marketplace is the manual `publish.yml` workflow, with the `VSCE_PAT` secret.

## Alternatives Considered

- Publish on every release. The Marketplace has no staging, so a person decides.

## Consequences

- **Positive:**
  - Consistent with the platform's and the SDK's workflows.
- **Negative:**
  - Publishing is a manual step.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-012: Testing](012-testing.md)
- [ADR-015: Semantic Versioning](015-versioning.md)
