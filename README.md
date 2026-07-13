# Strelit UI Kit

Strelit UI Kit is a TypeScript docking and workspace layout library derived from the Golden Layout codebase and being modernized as a standalone product line under `CTHub`.

## Current State

- TypeScript-first source in `src/`
- Fast test runner with `Vitest`
- API demo app served with `Vite`
- Linting with `Oxlint`
- Formatting with `Prettier`
- API surface checks with `api-extractor`
- HTML docs generated with `TypeDoc`
- Migration guide and codemod available for Golden Layout adopters

## Versioning

This repository uses Strelit's own version line. It is not a continuation of an upstream "version 2" product name.

- `0.x` is used while public API, configuration, and styling contracts are still being intentionally modernized.
- `1.0.0` should be used for the first stable Strelit release with an explicitly supported public contract.
- After `1.0.0`, semantic versioning applies normally:
    - major for breaking API, config, or styling changes
    - minor for backward-compatible features
    - patch for backward-compatible fixes

See [VERSIONING.md](./VERSIONING.md) for the repo policy.

## Development

Install dependencies:

```bash
npm ci
```

Main workflows:

```bash
npm run test
npm run bench
npm run lint
npm run build
npm run doc
npm run apitest:serve
npm run migrate:golden-layout -- --target ../my-app --dry-run
```

Benchmark workflows:

```bash
npm run bench
npm run bench:watch
```

This runs the benchmark specs in `test/bench`, including both config-oriented and JSDOM-backed layout benchmarks.

## Output

`npm run build` generates:

- CommonJS output in `dist/cjs`
- ESM output in `dist/esm`
- rolled-up declarations in `dist/types`
- CSS/LESS/SCSS assets in `dist`

## Notes

- This repository still contains upstream compatibility layers and documentation that are being incrementally modernized.
- The original upstream license notices are preserved where required.

## Migration

If you are moving an existing Golden Layout based application onto Strelit UI Kit:

- read [docs/migration/index.md](./docs/migration/index.md)
- run `npm run migrate:golden-layout -- --target <path> --dry-run`
