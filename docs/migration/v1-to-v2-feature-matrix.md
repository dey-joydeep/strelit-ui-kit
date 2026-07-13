# v1 To v2 Feature Matrix

This matrix treats the current Strelit codebase as the strategic line, not as a requirement to exactly freeze Golden Layout 1.5.9 behavior.

## Status Legend

- `Preserved`: available with little or no migration cost
- `Migrated`: available, but source or config changes are required
- `Improved`: v2 keeps the use-case and offers a better model
- `Dropped`: intentionally removed
- `Gap`: not good enough yet for a clean migration story

## Summary

The strongest v2 gains are:

- TypeScript and typed config resolution
- no jQuery runtime dependency
- explicit component lifecycle and focus APIs
- virtual component binding for framework integration
- restored public query helpers on both `ContentItem` and `LayoutManager`

The biggest migration breaks are:

- nested stacks are intentionally unsupported
- constructor and init flow changed
- selection moved to focus semantics
- several APIs were renamed even where deprecated aliases remain

## Feature Matrix

| Area                   | v1                                                  | Current v2                                                        | Status    | Notes                                                                                                                                 | Action                                 |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Runtime implementation | jQuery-heavy JavaScript                             | TypeScript-first module runtime                                   | Improved  | Better maintainability and typing                                                                                                     | Keep                                   |
| jQuery dependency      | required                                            | removed from runtime                                              | Improved  | Major modernization win                                                                                                               | Keep and advertise                     |
| Constructor flow       | `new GoldenLayout(config, container)` then `init()` | `new StrelitLayout(container)` then `loadLayout(config)`          | Migrated  | Deprecated constructor path still exists                                                                                              | Keep migration docs and examples       |
| Save layout            | `toConfig()`                                        | `saveLayout()` with deprecated alias                              | Migrated  | Clearer naming                                                                                                                        | Keep alias until v3                    |
| Resize API             | `updateSize()`                                      | `setSize()` with deprecated alias                                 | Migrated  | Clearer naming                                                                                                                        | Keep alias until v3                    |
| Config typing          | weakly typed JS config                              | typed `Config` and `ResolvedConfig` model                         | Improved  | Better correctness and persistence model                                                                                              | Keep                                   |
| Component config key   | `componentName`                                     | `componentType`                                                   | Migrated  | Legacy config migration still exists                                                                                                  | Keep codemod and docs                  |
| Component registration | single `registerComponent()` path                   | constructor/factory registration plus legacy alias                | Improved  | More explicit API                                                                                                                     | Prefer explicit v2 APIs                |
| Dynamic component add  | supported                                           | `addComponent()` and `newComponent()`                             | Preserved | Works with location selectors                                                                                                         | Add parity tests                       |
| Drag source API        | `createDragSource()`                                | `newDragSource()` overloads                                       | Migrated  | Capability retained, API shifted                                                                                                      | Add examples/tests                     |
| Popouts                | supported                                           | supported                                                         | Preserved | Still core behavior                                                                                                                   | Add regression coverage                |
| Cross-window event hub | supported                                           | `layout.eventHub`                                                 | Preserved | Continuity retained                                                                                                                   | Add focused tests                      |
| Replace in-place       | ad hoc                                              | `ComponentContainer.replaceComponent()`                           | Improved  | Better lifecycle control                                                                                                              | Keep and document                      |
| State persistence hook | older `getState()` / `setState()` pattern           | `initialState`, `stateRequestEvent`, deprecated old methods       | Improved  | Better save-time ownership model                                                                                                      | Prefer new path                        |
| Component release hook | limited                                             | `beforeComponentRelease`                                          | Improved  | Cleaner cleanup point                                                                                                                 | Add tests                              |
| Selection model        | `selectionEnabled`, select/deselect                 | focus/blur plus `stackHeaderClick`                                | Migrated  | Behavioral migration needed                                                                                                           | Document clearly                       |
| Active stack item APIs | `getActiveContentItem()`, `setActiveContentItem()`  | `getActiveComponentItem()`, `setActiveComponentItem()` plus alias | Migrated  | Low migration cost                                                                                                                    | Keep alias for now                     |
| Tree query helpers     | convenience helpers in v1                           | restored on `ContentItem` and `LayoutManager`                     | Improved  | Current repo already exposes `getItemsById()`, `getItemsByType()`, `getComponentItemsByType()` and deprecated `getComponentsByName()` | Keep public                            |
| Nested stacks          | possible but unreliable                             | intentionally unsupported                                         | Dropped   | Explicit design constraint                                                                                                            | Keep dropped unless redesign is funded |
| Framework integration  | awkward for Angular/Vue                             | bind/unbind events and virtual component model                    | Improved  | Strong v2 advantage                                                                                                                   | Expand examples later                  |
| Plain JS / TS use      | yes, but jQuery-based                               | yes, no jQuery                                                    | Improved  | Strong product positioning                                                                                                            | Add plain TS example later             |
| Legacy browser support | broader historical assumptions                      | modern browsers only                                              | Dropped   | Deliberate maintenance tradeoff                                                                                                       | Accept                                 |

## API Replacement Table

| v1 API / pattern                                      | Current v2 replacement                                     | Status   |
| ----------------------------------------------------- | ---------------------------------------------------------- | -------- |
| `new GoldenLayout(config, container); layout.init();` | `new StrelitLayout(container); layout.loadLayout(config);` | Migrated |
| `layout.toConfig()`                                   | `layout.saveLayout()`                                      | Migrated |
| `layout.updateSize(width, height)`                    | `layout.setSize(width, height)`                            | Migrated |
| `layout.registerComponent(name, ctor)`                | `layout.registerComponentConstructor(name, ctor)`          | Migrated |
| `layout.registerComponent(name, factory)`             | `layout.registerComponentFactoryFunction(name, factory)`   | Migrated |
| `componentName`                                       | `componentType`                                            | Migrated |
| `layout.createDragSource(...)`                        | `layout.newDragSource(...)`                                | Migrated |
| `item.select()` / `item.deselect()`                   | `componentItem.focus()` / `componentItem.blur()`           | Migrated |
| `selectionEnabled`                                    | focus model plus `stackHeaderClick`                        | Dropped  |
| `stack.getActiveContentItem()`                        | `stack.getActiveComponentItem()`                           | Migrated |
| `stack.setActiveContentItem(item)`                    | `stack.setActiveComponentItem(item, focus)`                | Migrated |
| `container.getElement()`                              | `container.element`                                        | Migrated |
| `container.getState()` / `container.setState()`       | `container.initialState`, `container.stateRequestEvent`    | Improved |
| component cleanup conventions                         | `beforeComponentRelease`                                   | Improved |
| `getComponentEvent` / `releaseComponentEvent`         | `bindComponentEvent` / `unbindComponentEvent`              | Improved |

## Current Judgment

The current repo is in a credible position to migrate most v1 applications, but not as a drop-in replacement. The clearest remaining parity burden is not the runtime itself, but proof:

- more focused regression tests around preserved behavior
- stronger examples for drag sources, popouts, and focus migration
- explicit documentation where v1 behavior was intentionally dropped
