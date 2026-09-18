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
- bounded, cycle-safe layout resolution and component-state copying
- migration writes protected by link rejection and real-path containment checks
- real CLI migration tests that compile representative v1, v2, and v2 API-demo consumers against the current public API
- Oxlint JSDoc tag/access validation and zero-warning TypeDoc public-documentation enforcement

Future product development should add features directly to the Strelit contract. Compatibility transformations for external Golden Layout projects belong in `scripts/migrate-golden-layout-to-strelit.js` and `docs/migration/`.
