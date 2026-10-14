# ADR Introduction

Architectural Design Records (ADRs) are short documents that capture a single architectural or design decision, its context, and its consequences. Less is more: keep them brief.

These are the ADRs of the Smarter Manifest VS Code extension. They follow the Smarter platform's own [ADRs](https://github.com/smarter-sh/smarter/tree/main/docs/source/adr), as the [Python SDK's](https://github.com/smarter-sh/smarter-python/tree/main/doc/adr) do: where the extension applies a platform decision, its ADR says so and links to it, and adapts it to an editor extension that runs on the user's machine. The platform's decisions about its own runtime (Django, Docker, Kubernetes, the database, Celery, React, templates, feature flags, internationalization) don't apply here and are not repeated.

See: [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html)

## Guidelines for writing ADRs

- **One decision per ADR.**
- **Be concise.** Focus on clarity and brevity.
- **State the context:** the forces that led to the decision.
- **List the alternatives**, and why they weren't chosen.
- **Explain the decision**, and **describe its consequences**, positive and negative.
- **Use simple language**, for future contributors without today's context.
- **Use the same format** as the others, and **reference related ADRs**.
- **Don't rewrite a decision that changed.** Add a new ADR, and mark the old one "Superseded by ADR-NNN".

## Index

- [ADR-001: Scope and Purpose of the Extension](001-scope.md)
- [ADR-002: Settings](002-settings.md)
- [ADR-003: The Platform's Contract Is the Source](003-contract.md)
- [ADR-004: Schemas from the Platform, Bundled as the Fallback](004-schema-source.md)
- [ADR-005: A Core Without VS Code](005-core-without-vscode.md)
- [ADR-006: Read YAML as the Platform Does](006-yaml-parity.md)
- [ADR-007: Two Kinds of Diagnostics](007-diagnostics.md)
- [ADR-008: Writes Go Through the Cli Api, After Confirmation](008-writes-through-cli-api.md)
- [ADR-009: Api Keys](009-api-keys.md)
- [ADR-010: Logging](010-logging.md)
- [ADR-011: One Bundle](011-bundling.md)
- [ADR-012: Testing](012-testing.md)
- [ADR-013: CI/CD](013-ci-cd.md)
- [ADR-014: Code Quality](014-code-quality.md)
- [ADR-015: Semantic Versioning](015-versioning.md)
- [ADR-016: Dependencies](016-dependencies.md)
- [ADR-017: Security](017-security.md)
- [ADR-018: Supported VS Code Versions](018-vscode-versions.md)
- [ADR-019: Error Handling](019-error-handling.md)
