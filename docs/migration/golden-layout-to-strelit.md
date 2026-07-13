# Golden Layout To Strelit Migration

This guide is for applications that still use Golden Layout naming, package imports, or CSS selectors and want to move onto Strelit UI Kit.

## What Changes Automatically

The repository includes a conservative migration helper that can rewrite the most common mechanical renames:

```bash
npm run migrate:golden-layout -- --target ../my-app --dry-run
```

To apply the changes:

```bash
npm run migrate:golden-layout -- --target ../my-app --write
```

The tool currently rewrites:

- package name `golden-layout` -> `strelit-ui-kit`
- class name `GoldenLayout` -> `StrelitLayout`
- CSS namespace `lm_` -> `strelit_`
- config property `componentName` -> `componentType`
- query helper `getComponentsByName` -> `getComponentItemsByType`
- legacy type names `ItemContainer` -> `ComponentContainer`
- legacy type names `AbstractContentItem` -> `ContentItem`

## What Still Needs Manual Review

The migration helper is intentionally conservative. You should still review:

- component registration code
- saved layout/config payloads
- any code relying on deprecated APIs
- custom theme overrides or DOM selectors
- framework integrations that relied on older binding patterns

## Key Product Differences

Strelit UI Kit is not a re-published Golden Layout package. Expect these differences:

- product and package naming changed
- DOM and CSS class namespaces changed from `lm_` to `strelit_`
- public API modernization removed some legacy compatibility aliases
- the repo now uses a TypeScript-first toolchain with Vitest, Vite, Oxlint, Prettier, api-extractor, and TypeDoc

## Suggested Migration Workflow

1. Run the migration helper in `--dry-run` mode.
2. Review the planned file changes.
3. Re-run with `--write`.
4. Fix any application-specific breakages by hand.
5. Rebuild and retest your application.
6. Review the broader migration notes in [index.md](./index.md).
