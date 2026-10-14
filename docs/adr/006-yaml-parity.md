# ADR-006: Read YAML as the Platform Does

## Status

Accepted

Adapts the platform's [ADR-005: Manifests](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/005-manifests.rst).

## Context

The platform reads a manifest with PyYAML's `safe_load`, which implements YAML 1.1. Most JavaScript parsers implement YAML 1.2, which resolves some plain scalars differently: `postalCode: 02139` is the string "02139" to PyYAML and the number 2139 to YAML 1.2, `y` is a string to PyYAML and a boolean to some 1.1 parsers, and js-yaml turns `2026-12-31` into a `Date`. Validating a different value than the platform will see reports errors that don't exist, and misses ones that do.

## Decision

- Manifests are parsed only by `parseManifests()` in `src/core/yamlDoc.ts`: the `yaml` package with its YAML 1.1 schema, adjusted to PyYAML's resolution of booleans, integers and floats, and without timestamps, so a date stays a string, as it is in the JSON that Pydantic validates. A table of PyYAML's own results is a unit test.
- The extension sends the platform a manifest's **YAML text** (`application/x-yaml`), exactly as the smarter cli does, never a JSON re-serialization of its own parse. What validate and apply see is what PyYAML parses.
- Where Pydantic is more lenient than JSON Schema (a date for a datetime), the validator follows Pydantic.

## Alternatives Considered

- js-yaml, or the `yaml` package's default YAML 1.2. Simpler, and wrong for exactly the values above.
- Send JSON to the platform. Then the platform validates the extension's interpretation of the YAML, not the YAML.

## Consequences

- **Positive:**
  - The extension and the platform agree on every value, so an error in the editor is an error on the platform.
  - The `yaml` package keeps every node's position, and keeps parsing after a syntax error.
- **Negative:**
  - The PyYAML adjustments depend on the `yaml` package's tag internals, so its upgrades must pass the parity table.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-007: Two Kinds of Diagnostics](007-diagnostics.md)
- [ADR-008: Writes Go Through the Cli Api, After Confirmation](008-writes-through-cli-api.md)
