# Migration

Strelit UI Kit has its own public API, configuration schema, branded root selector, and version line. It openly derives from Golden Layout v2.6.0 while preserving general-purpose `LayoutManager` naming and `lm_` selectors. The runtime does not provide Golden Layout compatibility aliases or config coercion.

Use the [Golden Layout to Strelit guide](./golden-layout-to-strelit.md) and the bundled migration tool for an existing application:

```bash
npm run migrate:golden-layout -- --target ../my-app --dry-run
npm run migrate:golden-layout -- --target ../my-app --from v2 --write
```

The dry run reports syntax-aware source rewrites, recognized saved-layout transformations, and manual-review findings before any file is changed. After applying them, resolve all findings and compile the consumer against Strelit's types. Saved Golden Layout configurations must be migrated before passing them to `resolveLayoutConfig()` or `loadLayout()`.

The main contract changes are:

- construct with `new StrelitLayout(container)` and load configuration with `loadLayout(config)`
- use `componentType`, `size`, `minSize`, `root`, `header`, and `window`
- register components with `registerComponentConstructor()` or `registerComponentFactoryFunction()`
- use `bindComponentEvent` and `unbindComponentEvent` for application-managed components
- persist layouts with `saveLayout()`
- resize manually with `setSize()` when automatic resizing is disabled
- use `ComponentContainer`, `ContentItem`, and `ComponentItem`

Migration support belongs to the tool and documentation, not to the Strelit runtime.

Maintainers extending the codemod must follow the [migration tool maintenance contract](./migration-tool-maintenance.md).
