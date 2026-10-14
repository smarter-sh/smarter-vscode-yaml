# ADR-017: Security

## Status

Accepted

Adapts the platform's [ADR-016: Security](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/016-security.rst).

## Context

The extension holds api keys that can change production resources, can create billable infrastructure, reads the smarter cli's config file, and runs in the user's editor with their permissions. Its repository and its Marketplace page are public.

## Decision

- Api keys are kept in SecretStorage, sent only in the `Authorization` header, and never logged or shown (ADR-009).
- Every write asks for confirmation, names its target, and goes through the cli api (ADR-008).
- Every request has a timeout. The extension makes no request but to the configured platform, and sends no telemetry.
- It never executes code from a manifest or a response, and renders schema descriptions as Markdown without command links.
- Test data and examples use placeholders: no keys, account numbers, names or private hostnames.

## Alternatives Considered

- Store keys in settings, or skip confirmations. Rejected, as above.

## Consequences

- **Positive:**
  - The extension can be trusted with production keys.
- **Negative:**
  - Confirmations add clicks.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-008: Writes Go Through the Cli Api, After Confirmation](008-writes-through-cli-api.md)
- [ADR-009: Api Keys](009-api-keys.md)
