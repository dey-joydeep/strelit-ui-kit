# Golden Layout To Strelit Migration

Strelit UI Kit is based on Golden Layout v2.6.0. This guide is for applications that use Golden Layout naming, package imports, source APIs, CSS selectors, or saved layouts and want to migrate to Strelit's modern module API.

## What Changes Automatically

The repository includes a conservative migration helper. It uses the TypeScript parser for JavaScript and TypeScript files and a schema-aware transformer for recognized layout JSON:

```bash
npm run migrate:golden-layout -- --target ../my-app --dry-run
```

To apply the changes:

```bash
npm run migrate:golden-layout -- --target ../my-app --write
```

Use `--from v1` or `--from v2` when migrating saved layouts from a known Golden Layout generation. The default `--from auto` applies shared deterministic transformations, while explicit modes add generation-specific diagnostics.

The tool currently rewrites:

- package name `golden-layout` -> `strelit-ui-kit`
- class name `GoldenLayout` -> `StrelitLayout`
- branded root selector `lm_goldenlayout` -> `lm_strelit`
- legacy type names `ItemContainer` -> `ComponentContainer`
- legacy type names `AbstractContentItem` -> `ContentItem`
- `SizeUnitEnum` and its dotted helpers -> `SizeUnit` and named module helpers
- namespace types such as `LayoutConfig.Settings` -> module types such as `LayoutConfigSettings`
- receiver-aware layout, container, and stack methods such as `toConfig()` -> `saveLayout()` when the receiver can be proven
- dotted config helpers such as `LayoutConfig.resolve()` -> named module functions
- saved-layout fields including `content`, `componentName`, numeric sizing, array IDs, header settings, labels, and legacy popout dimensions

The migration is idempotent: running it again on migrated input makes no further changes.

## What Still Needs Manual Review

The migration helper is intentionally conservative. You should still review:

- component registration code, which must choose constructor or factory registration explicitly
- constructor configs, which must move to a separate `loadLayout()` call
- multiple root entries or multiple non-protocol IDs in saved layouts, because v2.6 retained only one value
- v1 `react-component` items and nested stack content, which require the framework adapter or workspace redesign described by the diagnostic
- component state mutation, which must move to `initialState` and `stateRequestEvent`
- receiver-dependent method calls when the receiver type cannot be proven
- deprecated drag-source callback objects using `type` and `state`; convert them explicitly to `ComponentItemConfig` with `componentType` and `componentState`
- computed API access and dynamic imports
- custom theme overrides or DOM selectors
- framework integrations that relied on older binding patterns

## Key Product Differences

Strelit UI Kit is not a re-published Golden Layout package. Expect these differences:

- product and package naming changed
- general-purpose `lm_` DOM and CSS class names remain unchanged
- the runtime accepts only Strelit APIs and configuration; it does not retain Golden Layout compatibility aliases
- `closePopoutsOnUnload` remains because it is useful layout behavior, not a brand or legacy implementation detail
- the repo now uses a TypeScript-first toolchain with Vitest, Vite, Oxlint, Prettier, api-extractor, and TypeDoc

## Suggested Migration Workflow

1. Run the migration helper in `--dry-run` mode.
2. Review the planned file changes.
3. Re-run with `--write`.
4. Fix any application-specific breakages by hand.
5. Rebuild and retest your application.
6. Resolve every manual-review warning before compiling against Strelit.
