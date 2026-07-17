# Modernization Status

The Strelit runtime now exposes a Strelit-only contract.

Completed work includes:

- TypeScript-first source and strict compilation
- Vitest tests and benchmarks
- Vite API demo
- tsup package bundling
- Oxlint and Prettier checks
- API Extractor and TypeDoc generation
- Strelit CSS and popout namespaces
- removal of deprecated constructors, aliases, config fallbacks, and binding paths
- a separate Golden Layout migration guide and codemod

Future product development should add features directly to the Strelit contract. Compatibility transformations for external Golden Layout projects belong in `scripts/migrate-golden-layout-to-strelit.js` and `docs/migration/`.
