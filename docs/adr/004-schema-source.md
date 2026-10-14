# ADR-004: Schemas from the Platform, Bundled as the Fallback

## Status

Accepted

Adapts the platform's [ADR-018: Caching](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/018-caching.rst).

## Context

Users apply manifests to platforms of different versions: production, a local development platform, a customer's own installation. The schema that matters is the one of the platform that the manifest will be applied to. But an editor must also work offline, and must never make typing wait on the network. The old extension fetched schemas with no timeout and remembered no failure, so an offline editor retried on every keystroke.

## Decision

- With `smarterYaml.schemaSource` set to `platform` (the default), a kind's schema is read from the platform's public `/api/v1/cli/json-schema/<Kind>/`, and cached for 30 minutes.
- When the platform can't be reached, or doesn't know the kind, the bundled schema (ADR-003) is used, and the platform isn't asked again for a minute.
- With `bundled`, the platform is never asked.
- Concurrent requests for the same schema share one fetch. Every request has a timeout (`smarterYaml.requestTimeout`).
- Changing the platform url or any setting clears the cache. **Smarter: Reload Schemas** clears it by hand.

## Alternatives Considered

- Always bundled. Simple and offline, but wrong for any platform newer or older than the bundle.
- Always live. Breaks offline, and every new editor session waits on the network.

## Consequences

- **Positive:**
  - Validation matches the target platform when it is reachable, and still works when it isn't.
- **Negative:**
  - A schema can be up to 30 minutes old after the platform is upgraded (Reload Schemas fixes that).
  - Which source was used isn't obvious: the log says.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-003: The Platform's Contract Is the Source](003-contract.md)
- [ADR-002: Settings](002-settings.md)
