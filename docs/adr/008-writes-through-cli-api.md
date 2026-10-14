# ADR-008: Writes Go Through the Cli Api, After Confirmation

## Status

Accepted

Follows the platform's [ADR-024: Broker Model](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/024-broker-model.rst) and [ADR-006: REST API](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/006-rest-api.rst), as the SDK's [SDK ADR-003: Writes Go Through the Manifest API](https://github.com/smarter-sh/smarter-python/blob/main/doc/adr/003-writes-through-manifests.md) does.

## Context

The platform has two ways to change a resource: the brokered cli api (`/api/v1/cli/apply/`, `deploy/`, `undeploy/`, `delete/`), which validates a manifest with its kind's model and applies its business rules, and the REST views' own write handlers, which are inconsistent. Writes from an editor are easy to trigger by accident, and some create real, billable infrastructure.

## Decision

- The extension changes resources only through the cli api, exactly as the smarter cli does, and reads them with `get` and `describe`.
- Apply, undeploy and delete ask for confirmation in a modal dialog that names the kind, the resource and the platform. Apply warns when the manifest has errors.
- Deploy runs only when the user runs the command. No test or probe deploys.
- Nothing is written to a platform automatically: validation on save calls `validate`, which saves nothing.

## Alternatives Considered

- The REST api's writes. Inconsistent, and they skip the brokers.
- No confirmations. Fewer clicks, and a costly mistake one click away.

## Consequences

- **Positive:**
  - A manifest that works with the cli works with the extension, and the other way round.
  - Every write is deliberate and names its target.
- **Negative:**
  - A confirmation per write.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-009: Api Keys](009-api-keys.md)
- [ADR-017: Security](017-security.md)
