# ADR-003: The Platform's Contract Is the Source

## Status

Accepted

Follows the platform's [ADR-031: Pydantic Models Over Raw JSON](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/031-pydantic-over-json.rst) and [ADR-023: API Versioning](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/023-api-versioning.rst), as the SDK's [SDK ADR-005: Mirrored Contracts and Generated SAM Models](https://github.com/smarter-sh/smarter-python/blob/main/doc/adr/005-platform-models.md) does.

## Context

The platform publishes its api as files generated from its Pydantic models, in `smarter/smarter/apps/api/v1/contract/`: the JSON Schema and an example manifest of every SAM kind, and an OpenAPI document of the api. Hand-written copies of shapes drift: the extension's bundled schemas had drifted for two years, and its kind list named kinds that no longer exist.

## Decision

- `scripts/sync-contracts.sh` copies the contract into `contract/`, at a git ref of the platform. The files are never edited by hand.
- The bundled `contract/sam/` files are the extension's offline schemas, its New Manifest examples, its list of kinds, and its unit tests' data. No list of kinds exists anywhere else.
- `src/contract/openapi.d.ts` is generated from `contract/openapi.json` (openapi-typescript), and the api client's request and response types come from it, never from hand-written interfaces.
- A unit test fails when the bundled kinds and the OpenAPI document disagree.

## Alternatives Considered

- Hand-maintained schemas and types. They drift as soon as they are written.
- Only the live schemas, nothing bundled. Then nothing works offline, and the tests need a platform.

## Consequences

- **Positive:**
  - A platform change reaches the extension by a sync, and shows up as a compile error or a failing test, not as a user's bug report.
  - The extension, the SDK and the platform describe manifests identically.
- **Negative:**
  - Someone must run the sync (monthly maintenance).
  - The extension can only be as precise as the schemas: choices that the platform documents only in prose can't be checked.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-004: Schemas from the Platform, Bundled as the Fallback](004-schema-source.md)
- [ADR-012: Testing](012-testing.md)
