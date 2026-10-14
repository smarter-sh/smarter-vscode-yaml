# ADR-001: Scope and Purpose of the Extension

## Status

Accepted

## Context

Smarter's resources are declared in YAML manifests (`apiVersion: smarter.sh/v1`) and applied with the smarter cli, the Python SDK, the REST api or the web console's manifest editor. Most manifests are written in an editor, where a mistake (a misspelled key, a wrong type, an unknown kind) used to show up only when `smarter apply` refused it, or never, when the platform silently ignored it. The extension had been unmaintained for two years: it bundled 13 schemas of an older platform, used a legacy schema url, and reported most errors on the wrong line.

## Decision

The extension is the editor for Smarter manifests, and nothing more general:

- It activates on YAML files, and acts only on documents whose `apiVersion` is `smarter.sh/v1`. Other YAML is left to other extensions.
- It validates, completes, documents and fixes manifests as you type, from the platform's own schemas.
- It runs the cli api's commands on the manifest in the editor (validate, apply, deploy, undeploy, delete, describe), so that a manifest can go from editor to platform without a terminal.
- It does not reimplement the platform's business rules: the platform's `validate` is one command away (ADR-007).
- It does not depend on Red Hat's YAML extension, and does not contribute its `yaml.schemas` setting.

## Alternatives Considered

- Contribute the schemas to Red Hat's YAML extension (`yaml.schemas`), and write no language features. Simpler, but it can't say which kind a document is before parsing it, can't run platform commands, and makes users install a second extension.
- A general YAML extension. Out of scope: Red Hat's already exists.

## Consequences

- **Positive:**
  - One place to edit, check and apply a manifest, for any platform the user can reach.
  - Other YAML files are untouched.
- **Negative:**
  - Its language features are its own code, which must be maintained (ADR-005, ADR-012).

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-003: The Platform's Contract Is the Source](003-contract.md)
- [ADR-007: Two Kinds of Diagnostics](007-diagnostics.md)
- [ADR-008: Writes Go Through the Cli Api, After Confirmation](008-writes-through-cli-api.md)
