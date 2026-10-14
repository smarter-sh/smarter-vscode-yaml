# ADR-007: Two Kinds of Diagnostics

## Status

Accepted

Adapts the platform's [ADR-012: Error Handling](https://github.com/smarter-sh/smarter/blob/main/docs/source/adr/012-error-handling.rst).

## Context

A JSON Schema can check structure, types and allowed values, but not the platform's business rules (a field that depends on another, a reference to a resource that must exist). The platform's own `validate` command checks everything that `apply` would, but it needs the network and an api key, and runs against one version of the text. Pydantic also ignores undeclared keys by default, and the schemas don't forbid them, so a misspelled key passes both checks and is silently dropped.

## Decision

- **As you type**, debounced, the `smarter` collection reports JSON Schema problems (Ajv, draft 2020-12), each at the exact key or value it is about, and grouped into one readable message per value (an optional field's `anyOf` with null is one problem, not three). Problems carry quick fix data.
- **Unknown keys** in a mapping whose schema lists its fields are reported as warnings (`smarterYaml.unknownKeys`), with the closest declared key as a suggestion. Dict fields and free-form objects are never checked.
- **On demand, or on save** (`smarterYaml.validateOnSave`), the `smarter-platform` collection holds the platform's `validate` result, mapped to positions by its `loc` paths. It is cleared when the text changes, because it describes the text that was sent.
- A validation rule must not flag a manifest that the platform accepts: the corpus of real manifests is a test (ADR-012).

## Alternatives Considered

- Only the platform's validation. Needs the network and a key for every keystroke.
- Only the JSON Schema. Misses business rules.
- Unknown keys as errors. The platform accepts them, so an error would be false.

## Consequences

- **Positive:**
  - Fast feedback offline, and the platform's authoritative answer when asked for.
- **Negative:**
  - Two collections with different lifetimes, which the code must keep apart.

## Related ADRs

- [ADR-000: Introduction](000-intro.md)
- [ADR-006: Read YAML as the Platform Does](006-yaml-parity.md)
- [ADR-008: Writes Go Through the Cli Api, After Confirmation](008-writes-through-cli-api.md)
- [ADR-012: Testing](012-testing.md)
