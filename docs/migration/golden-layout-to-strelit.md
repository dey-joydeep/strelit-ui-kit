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
- published JavaScript entries such as `dist/index.js` and `dist/esm/index.js` -> the Strelit package root
- published CSS, Less, and supported Sass paths -> their exported Strelit style paths, preserving query and hash suffixes
- class name `GoldenLayout` -> `StrelitLayout`
- branded root selector `lm_goldenlayout` -> `lm_strelit`
- legacy type names `ItemContainer` -> `ComponentContainer`
- legacy type names `AbstractContentItem` -> `ContentItem`
- `SizeUnitEnum` and its dotted helpers -> `SizeUnit` and named module helpers
- namespace types such as `LayoutConfig.Settings` -> module types such as `LayoutConfigSettings`
- receiver-aware layout, container, and stack methods such as `toConfig()` -> `saveLayout()` when the receiver can be proven
- dotted config helpers such as `LayoutConfig.resolve()` -> named module functions
- saved-layout fields including `content`, `componentName`, numeric sizing, array IDs, header settings, labels, and legacy popout dimensions
- numeric `width`, `height`, `minWidth`, `minHeight`, `minItemWidth`, and `minItemHeight` fields in typed layout literals when their replacement is unambiguous

The migration is idempotent: running it again on migrated input makes no further changes.

Package-path migration is allowlist-based. Unsupported internal or unknown package subpaths are left unchanged and reported for manual review; the tool never invents a matching Strelit deep path. Namespace imports, dynamic imports, TypeScript import-equals declarations, and unavailable Sass themes are also preserved until a developer resolves their diagnostic. Bindings owned by a preserved import are excluded from later identifier, dotted-API, and receiver-method rewrites.

HTML and non-layout JSON receive only bounded package-specifier and branded-selector replacements. Embedded source APIs are left unchanged and reported rather than being rewritten as unparsed text. JavaScript or TypeScript files with syntax errors are likewise preserved for manual migration.

Dry-run is the default and is verified to leave every target file byte-for-byte unchanged. Write mode rejects symbolic links, Windows reparse points, and multiply linked files, and rechecks real-path containment before every read and write.

## Demo-Based Verification

The migrator is tested by launching the real command-line process, not by calling private transformer functions. The suite covers dry-run and write mode, idempotence, v1 and v2 source compilation against the current Strelit public API, saved-layout load/save/reload behavior, and filesystem-containment failures.

The Golden Layout v2.6 API demo was also migrated from a fresh sibling-repository copy. Its deterministic source transformations complete without sizing warnings. A representative `v2-api-demo.ts` fixture, including the original demo's numeric item and dimension sizing forms, is retained in the automated compile suite to prevent regression.

The current `apitest/` application was modernized manually beyond API migration: its webpack harness became Vite, formatting was updated, package-internal imports were changed to the Strelit source entry point, and local variables and visible copy were rebranded. Those build-system and presentation changes are intentionally outside the consumer migration tool.

Maintainers can reproduce its production-build browser check with `npm run apitest:smoke`. Changes to the codemod must follow the [migration tool maintenance contract](./migration-tool-maintenance.md).

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
- namespace imports, TypeScript import-equals declarations, unsupported package deep imports, and unavailable Sass themes
- JavaScript embedded in HTML or other non-source files
- custom theme overrides or DOM selectors
- framework integrations that relied on older binding patterns
- project-specific build tooling, aliases, relative package-internal imports, local variable names, and visible product copy

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
7. Run the migrated application's own typecheck, build, and behavioral tests; a warning-free codemod run is not a substitute for application verification.
