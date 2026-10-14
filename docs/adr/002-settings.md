# ADR-002: Settings

## Status

Accepted

Adapts the platform's [ADR-007: Settings](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/007-settings.rst).

## Context

Users configure which platform the extension talks to, and how it validates. VS Code settings can live in user, workspace and folder scopes, and change at any time. The extension's settings were read once at load, so a change needed a reload, and their namespace, `smarterYaml`, was already in users' `settings.json` files.

## Decision

- Every setting is in the `smarterYaml` namespace, kept for compatibility with existing users' settings.
- Every setting is read **when it is used** (`src/settings.ts`), never cached, so a change applies at once. A change of any `smarterYaml.*` setting clears the schema cache and revalidates every open manifest.
- `smarterYaml.rootUrl` defaults to the public production platform. A command that changes it (Select Platform) writes to the scope where it is already set.
- Secrets are never settings (ADR-009).

## Alternatives Considered

- A new `smarter.*` namespace, matching the command ids. It would silently reset existing users' settings.
- Read settings once at activation. Simpler, but a change needs a window reload.

## Consequences

- **Positive:**
  - A setting change takes effect immediately, in the scope the user chose.
- **Negative:**
  - Command ids (`smarter.*`) and setting names (`smarterYaml.*`) differ.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-009: Api Keys](009-api-keys.md)
- [ADR-004: Schemas from the Platform, Bundled as the Fallback](004-schema-source.md)
