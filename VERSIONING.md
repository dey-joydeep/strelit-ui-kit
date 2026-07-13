# Versioning Policy

Strelit UI Kit uses its own product version line.

It is not versioned as "Golden Layout v2" and should not inherit upstream product naming in release labels or documentation.

## Current phase

The repository is currently in the `0.x` phase. This phase allows intentional cleanup and controlled breaking changes while the Strelit public contract is being finalized.

## Release policy

- `0.x`
    - Used while APIs, configuration contracts, CSS class namespaces, and compatibility layers are still being modernized.
    - Breaking changes are allowed when they are intentional and documented.
- `1.0.0`
    - Use for the first stable Strelit release with an explicitly supported public API and styling/config contract.
- `1.x+`
    - Follow semantic versioning.
    - Major: breaking API, config, CSS namespace, or behavior changes.
    - Minor: backward-compatible features and additive API changes.
    - Patch: backward-compatible fixes only.

## Practical guidance

- Keep `package.json` on a Strelit-native version number.
- Do not describe this repository as "version 2" in docs, releases, or package metadata.
- When a migration requires a breaking change before `1.0.0`, document it in the migration notes.
