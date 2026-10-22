# Versioning Policy

Strelit UI Kit uses its own product version line.

It is not versioned as "Golden Layout v2" and should not inherit upstream product naming in release labels or documentation.

## First stable release

`1.0.0` is designated as the first stable Strelit release. Its supported API, configuration, styling, packaging, and migration boundary are defined in [the 1.0 contract](./docs/architecture/stable-contract-1.0.md). Publication is a separate release step.

## Release policy

- `0.x`
  - Used while APIs, configuration contracts, CSS class namespaces, and compatibility layers are still being modernized.
  - Breaking changes are allowed when they are intentional and documented.
- `1.0.0`
  - Establishes the first stable Strelit public API and styling/config contract.
- `1.x+`
  - Follow semantic versioning.
  - Major: breaking API, config, CSS namespace, or behavior changes.
  - Minor: backward-compatible features and additive API changes.
  - Patch: backward-compatible fixes only.

## Practical guidance

- Keep `package.json` on a Strelit-native version number.
- Do not describe this repository as "version 2" in docs, releases, or package metadata.
- Document intentional breaking changes and migrations in the release notes and migration guide.
