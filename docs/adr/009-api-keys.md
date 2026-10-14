# ADR-009: Api Keys

## Status

Accepted

Adapts the platform's [ADR-016: Security](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/016-security.rst).

## Context

The cli api needs an api key for everything but the schemas and examples. A user may work with several platforms, each with its own key, and many already have keys saved by `smarter configure` in `~/.smarter/config.yaml`, one per environment. Settings files are plain text, often committed or synced.

## Decision

- Keys are stored in VS Code's SecretStorage (the operating system's keychain), one per platform url. They are never settings, and never logged.
- When none is stored, the key that the smarter cli saved for the platform's environment is used: `local` for `localhost`, `alpha`, `beta` or `next` for urls that start with them, `prod` otherwise. The file is only read.
- **Set API Key** checks a key with `whoami` before saving it. A 401 or 403 offers to set it again.
- Automatic actions (validation on save, the status bar's account) never prompt for a key; commands do.

## Alternatives Considered

- Keys in settings. Leak into dotfiles and repositories.
- Only SecretStorage. Makes every cli user enter a key they already have.

## Consequences

- **Positive:**
  - Zero setup for cli users, and no plain-text keys from the extension.
- **Negative:**
  - The cli's environment mapping is copied here (`src/core/cliConfig.ts`) and must follow the cli's.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-002: Settings](002-settings.md)
- [ADR-017: Security](017-security.md)
