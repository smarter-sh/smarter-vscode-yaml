# ADR-015: Semantic Versioning

## Status

Accepted

Follows the platform's [ADR-020: Semantic Versioning](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/020-semantic-versioning.rst).

## Context

Users update the extension from the Marketplace, which shows its version and changelog.

## Decision

semantic-release (`release.config.js`) versions each release from the conventional commit types on `main`: `feat` is a minor release, `fix` a patch. It writes `CHANGELOG.md` and the version in `package.json`. The extension's version is independent of the platform's: the platform's api is versioned by its path (`/api/v1`), which the extension uses.

## Alternatives Considered

- Matching the platform's version. The extension supports several platform versions at once.

## Consequences

- **Positive:**
  - Consistent with the platform and the SDK.
- **Negative:**
  - Only `feat` and `fix` commits release, so a user-visible change must use one of them.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-013: CI/CD](013-ci-cd.md)
