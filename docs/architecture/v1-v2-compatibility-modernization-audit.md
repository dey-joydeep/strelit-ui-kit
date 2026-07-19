# Strelit Compatibility And Modernization Audit

Date: 2026-07-17

## Executive Conclusion

Strelit should preserve the useful behavior of Golden Layout v2.6.0 without
retaining its old source-level API. Strelit is a new product and package, so the
target architecture is a fully modern module API with no namespace companions,
deprecated aliases, or runtime compatibility facades.

Removal is acceptable only when consumers have a tested migration path. The
project provides an AST-based source codemod, a saved-layout transformer,
branded selector and package-path rewrites, migration documentation, and
verification fixtures proving that representative v1.5.9 and v2.6.0 consumers
work after migration.

The current branch has syntax-aware, collision-safe source migration,
schema-aware saved-layout migration with explicit v1/v2 modes, and idempotence
fixtures. Tooling and implementation modernization are substantial and
generally sound. Representative v1.5.9 and v2.6.0 source fixtures compile after
migration, and a migrated v1 layout passes a load/save/reload behavioral test.
Generated inventories disposition all 880 v2 API declarations, 13 v1 entry
points/features, and all 80 v2 baseline test cases. The committed snapshots are
validated in the normal verification pipeline and can be refreshed against the
immutable sibling baselines by maintainers.

The dropped v1 features should not be restored indiscriminately. React support
is worth restoring as a modern adapter package. Raw nested stacks should remain
disabled until their use case is redesigned as a reliable composite workspace
feature. Legacy browsers, jQuery, and unrestricted internal APIs should not
return.

## Sources And Baselines

This audit used the following sources:

- Golden Layout v2.6.0 release source at immutable commit `f442a2d` in
  `../golden-layout`. The sibling working tree is dirty and was not treated as
  authoritative.
- Golden Layout v1.5.9 bundled source in `../golden-layout-v1.5.9`.
- The Golden Layout
  [Version 2 migration document](https://github.com/golden-layout/golden-layout/blob/master/docs/version-2/index.md).
- The current `feature/strelit-modernization` branch, including its uncommitted
  working-tree changes.
- The v2.6.0 and current API Extractor reports, package metadata, source code,
  styles, demos, and tests.

## Migration And Behavior Policy

Differences should be classified into four contract tiers.

### Tier A: Behavioral Contract

Useful v2.6.0 runtime behavior should remain available after migration. Source
code does not need to compile before migration, but the transformed consumer
must compile and retain equivalent layout, lifecycle, persistence, event,
drag/drop, focus, popout, and sizing behavior.

### Tier B: Removable Source And Configuration Contracts

Namespaces, dotted helpers, nested public types, deprecated methods, old config
fields, selectors, package paths, and aliases may be removed completely. Each
removal must have one of these dispositions:

- a deterministic automated source transformation;
- a deterministic saved-data or CSS transformation;
- a precise manual-review diagnostic when automation is unsafe; or
- an explicit unsupported-feature decision with rationale.

### Tier C: Required Brand Changes

Golden Layout product names must become Strelit names. These are intentional
breaking changes and should be handled by the migration tool:

- `GoldenLayout` to `StrelitLayout`
- `golden-layout` package paths to `strelit-ui-kit`
- Golden-branded files, documentation, global names, and popout protocol keys
- Explicitly Golden-branded selectors such as `lm_goldenlayout`

### Tier D: Strelit Features

Generics, named module helpers, framework adapters, new query APIs, performance
options, and workspace capabilities form the new API. They may replace old
source forms when the migration pipeline covers the replacement and verifies
equivalent behavior.

## Current V2.6.0 Compatibility Findings

### 1. Public TypeScript API Shape

Status: Complete for the audited v2.6.0 declaration surface.

The v2.6.0 public declaration surface uses merged interfaces and namespaces for
types and utilities such as:

- `LayoutConfig.resolve()` and `LayoutConfig.fromResolved()`
- `ResolvedLayoutConfig.minifyConfig()` and `unminifyConfig()`
- `ComponentContainer.Component` and `BindableComponent`
- `EventEmitter.UnknownParams` and bubbling event types
- `LayoutManager.Location`, `LocationSelector`, and constructor parameters
- Nested config types including `LayoutConfig.Settings` and
  `ResolvedPopoutLayoutConfig.Window`

Strelit flattens these into module-level names and removes config companion
objects. The generated inventory records a current target or explicit migration
outcome for every baseline declaration. No public declaration remains in an
unclassified manual state.

Disposition:

- Keep only module-level functions and named types in Strelit's final API.
- Do not restore namespace or companion-object facades.
- Retain the implemented TypeScript-parser source migration, including default,
  named, aliased, and CommonJS package imports.
- Keep receiver-aware call transforms where ownership can be proven and report
  ambiguous calls instead of guessing.
- Keep transformed v1.5.9 and v2.6.0 consumer fixtures compiling against
  Strelit.
- Emit manual-review findings for dynamic property access or constructs that
  cannot be transformed safely.

### 2. Public Data Types And Generics

Status: Complete with strict runtime validation and typed source migration.

The baseline `JsonValue` type is public and permits a broader `object` value.
Strelit replaced it with the stricter `SerializableValue` hierarchy. Component
instances also changed from `unknown` to `object`, and generic component APIs
constrain component implementations accordingly.

The stricter contracts are useful, but migration must identify values that do
not satisfy the new contract instead of silently asserting or discarding them.

Disposition:

- Remove `JsonValue`, `Json`, and nested component type aliases from the final
  Strelit API.
- Migrate serializable uses to `SerializableValue` and component implementation
  types to explicit generic parameters.
- Diagnose broad `object`, class instance, function, symbol, cyclic, and other
  non-serializable state instead of coercing it.
- Transform `SizeUnitEnum` references to `SizeUnit` constants and named parsing
  or formatting functions.
- Keep runtime rejection tests for non-serializable values and blocking
  migration diagnostics for unsafe source forms.

### 3. Runtime Methods And Constructors

Status: Complete under the no-facade migration policy.

Canonical behavior such as constructor and factory registration should remain
available through the modern generic Strelit methods. Exact old signatures do
not need to remain.

The following removed methods are explicitly deprecated v1 bridges in v2.6.0
and may remain removed:

- Config-loading constructors
- Ambiguous `registerComponent()` and `registerComponentFunction()`
- `ComponentContainer.getElement()`, `getState()`, `setState()`, and
  `extendState()`
- `LayoutManager.toConfig()`, `updateSize()`, manager minify wrappers, and
  deprecated `root`
- The legacy drag-source overload
- `Stack.getActiveContentItem()` and `setActiveContentItem()`
- `Tab.contentItem`, event `origin`, and old component-name aliases

The AST codemod transforms deterministic receiver calls and flags ambiguous
cases. No deprecated facade or alias is present in the Strelit runtime.

### 4. Configuration Schema

Status: Complete for deterministic v1/v2 fields, with blocking diagnostics for
lossy structures.

Removal of these deprecated v1 fields is acceptable:

- Numeric item `width`, `height`, `minWidth`, and `minHeight`
- `componentName`
- Array IDs and `__glMaximised`
- `hasHeaders`, root-level `content`, `labels`, and old icon settings
- Old popout dimensions
- Deprecated titles on non-component items

`closePopoutsOnUnload` is preserved as a normal Strelit setting because it is
useful general behavior rather than branding or an obsolete implementation
contract.

Useful config behavior and data survives through the versioned data migrator;
old property names, shapes, and dotted resolution APIs do not remain in the
runtime. The transformer handles deterministic fields and reports ambiguous or
lossy conversions. The Strelit runtime accepts only the current schema.

### 5. Container Resize Behavior

Status: Corrected and covered by tests.

Golden Layout v2.6.0 initializes `resizeWithContainerAutomatically` to `false`
and enables it automatically only when the layout container is `document.body`.
Strelit currently defaults it to `true` for custom containers as well.

Disposition:

- Preserve the restored v2 default behavior.
- Add `ResizeObserver` or automatic custom-container resizing as an explicit,
  documented option.
- Test body-container and custom-container behavior separately.

### 6. DOM And CSS Contract

Status: General-purpose selectors should remain unchanged.

The baseline exposes 51 `lm_` selectors. The `lm_` prefix describes
`LayoutManager`, which remains a core Strelit class, rather than the Golden
Layout product brand. Existing applications also depend on these selectors for
themes, automation, and integration tests. Renaming the entire namespace adds
migration cost without improving the architecture.

Disposition:

- Preserve general-purpose `lm_` classes in the runtime and distributed styles.
- Replace only the explicitly branded `lm_goldenlayout` root with `lm_strelit`.
- Keep Strelit-branded theme and package file names.
- Update the migration tool and documentation so they do not rewrite the
  general-purpose namespace.
- Preserve semantic DOM ordering and accessibility behavior.

The SVG mask replacement for raster icons is acceptable. It changes rendering
implementation without requiring separate PNG assets and can preserve control
behavior and selectors.

### 7. Popout And Event Protocols

Status: Complete brand replacement.

The popout query key, storage key, and window global were changed from `gl-*`
and `__glInstance` to Strelit equivalents. This is a required brand change as
long as all Strelit windows use the same protocol.

The child-window event is now `strelit_child_event`. No dual listener is needed
because mixed Golden Layout and Strelit windows are outside the supported
runtime contract.

### 8. Package And Build Outputs

Status: Toolchain and output replacement are acceptable with import migration.

Acceptable replacements include:

- TypeScript 5.9
- Tsup/esbuild instead of webpack
- Vitest instead of Karma and Jasmine
- Vite for the API demo
- Oxlint and Prettier
- Current API Extractor and TypeDoc
- Removal of jQuery and obsolete documentation tooling

The baseline ESM path is `dist/esm/index.js`; Strelit currently publishes
`dist/esm/index.mjs`. The new path may remain if package exports are complete and
the migration tool rewrites supported deep imports. CJS, types, CSS, LESS, and
SCSS paths require the same transformation and fixture coverage. Unsupported
internal deep imports should produce manual-review diagnostics.

Starting a new Strelit semantic version line at `0.1.0` is acceptable because
the package and product identity are new.

### 9. Behavioral Tests

Status: Complete baseline disposition with representative runtime parity.

The generated test inventory maps all 80 v2.6.0 active and disabled test cases.
It classifies 65 as ported or consolidated, 10 selection cases as replaced by
the focus model, and 5 XSS cases as replaced by safe native rendering tests.
The active Vitest suite also covers modernized behavior that did not exist in
the baseline.

Disposition:

- Keep the generated test-case mapping current with source test changes.
- Keep representative v1.5.9 and v2.6.0 compile fixtures and the migrated v1
  runtime round-trip fixture in the test suite.
- Keep demo typechecking before Vite build; Vite transpilation alone is not a
  TypeScript compatibility check.

### 10. Current Verification State

Status: Complete.

The `SizeUnitEnum` refactor has been completed against the modern `SizeUnit`
API. Library, public-module, and API demo TypeScript checks pass. Migration
fixtures verify external `SizeUnitEnum`, dotted helper, nested type, package,
selector, and saved-layout transformations, including idempotence. Migrated v1
and v2 source fixtures compile against Strelit's local public API. The API demo
is a broader consumer compilation target, and a v1 saved layout is migrated,
loaded, persisted, converted back to the public schema, reloaded, and compared
in Vitest.

The final `npm run verify:ordered` run passed all six fail-fast stages:
TypeScript compilation, build and API extraction, Vitest, compatibility
snapshot validation, zero-warning type-aware Oxlint, and Prettier checking. The
Vite API demo build, browser smoke, and TypeDoc generation also pass.
Both CJS and ESM self-references resolve through the package export map, the
publish dry run contains only release artifacts, and `npm audit` reports zero
vulnerabilities.

## Blocker Classification

Several findings in this report looked like compatibility blockers under the
earlier facade policy but are removable under the automated-migration policy.

### Removable After Verified Migration

These do not require compatibility code in the Strelit runtime:

- Namespace companions, dotted helpers, and nested public type references can
  be transformed by an AST codemod.
- Old symbol names, constructors, methods, and event type references can be
  rewritten or flagged when overload intent is ambiguous.
- `JsonValue`, broad component types, and `SizeUnitEnum` can be migrated to
  strict types with diagnostics for values that cannot satisfy the new
  contract.
- Deprecated config fields and saved layouts can be handled by a versioned data
  transformer before Strelit loads them.
- The branded `lm_goldenlayout` selector and old theme imports can be rewritten
  without changing other `lm_` selectors.
- Old package names and ESM/style deep paths can be rewritten to package-export
  targets.
- Golden-branded popout and event protocol names can be removed because mixed
  old/new runtime windows are not supported.

### Genuine Release Blockers

These cannot be solved merely by renaming source code:

- The Strelit repository itself must typecheck, test, lint, format, build, and
  generate its API and documentation successfully.
- Runtime default changes, such as custom-container automatic resizing, must be
  behaviorally preserved or represented by an explicit migrated option.
- Ambiguous or lossy saved data must never be silently discarded; it requires a
  deterministic rule or a blocking manual-review diagnostic.
- Dynamic imports, computed API property access, generated selectors, and
  reflection may be impossible to rewrite safely and must be reported.
- Migrated v1.5.9 and v2.6.0 fixtures must typecheck, build, and pass behavioral
  tests after transformation.
- The one-to-one test disposition must show which old behaviors are preserved,
  intentionally corrected, redesigned, or unsupported.
- Migration must be idempotent: a second run must produce no additional changes.
- The migration tool must preserve user formatting and unrelated code closely
  enough to make review practical.

Until these gates pass, complete removal may exist in source but cannot be
considered safely deliverable.

## Review Of Features Dropped From V1

### React Support

V1 capability: Direct core support for `type: 'react-component'` through a
special `lm-react-component` handler.

V1 implementation problems:

- Depends on global React and ReactDOM objects.
- Uses removed `ReactDOM.render()` and `unmountComponentAtNode()` APIs.
- Monkey-patches `componentWillUpdate`.
- Copies component state through deprecated container state methods.
- Couples the core layout engine to one UI framework and its lifecycle.

Usability assessment: High value. React is a major target for docking and
workspace products.

Maintainability assessment: The v1 implementation is not maintainable and
should not be restored.

Disposition: Restore the capability as a redesigned additive feature.

Recommended design:

- Keep React out of the core package dependencies.
- Build an official `@strelit/react` adapter over virtual components.
- Use React portals and current root APIs rather than moving framework-owned
  DOM nodes.
- Provide typed panel registration, hooks, lifecycle cleanup, state persistence,
  focus, visibility, and resize bindings.
- Preserve React context and component instances while panels are moved.
- Add React Strict Mode, concurrent rendering, and unmount regression tests.
- Keep the low-level virtual binding API available for custom integrations.

Current Strelit virtual components already provide the correct architectural
foundation. The roadmap's proposed React, Vue, and Angular adapters should be
retained and promoted from planning into an implementation track.

### Nested Stacks

V1 capability: A stack could contain rows, columns, components, or other stacks,
allowing a tab to represent a composite subtree.

V1 implementation problems:

- Drop behavior was restricted when the active child was not a component.
- Header, active-item, sizing, focus, close, and popout semantics were
  incomplete for composite children.
- Recursive stack structures complicate normalization and can produce redundant
  or ambiguous tree states.
- V2 intentionally constrained stack content to components for reliability.

Usability assessment: Potentially valuable for IDE-like workspaces, compound
documents, dashboard pages, and tabbed layout presets.

Maintainability assessment: High cost if implemented by merely widening
`StackItemConfig.content`. That approach should be rejected.

Disposition: Do not restore raw v1 nested stacks. Redesign and defer.

Recommended design options:

1. Introduce a distinct public item type such as `workspace`, `composite`, or
   `layoutTab` whose tab hosts a normalized row/column subtree.
2. Alternatively, provide a supported nested `StrelitLayout` component with
   explicit event, focus, sizing, and serialization boundaries.
3. Define normalization rules that prevent redundant stack-in-stack structures.
4. Specify drag/drop, popout, maximization, close, focus, persistence, and
   responsive behavior before implementation.
5. Prototype behind an experimental flag only after v2 parity is complete.

This preserves the useful outcome without reviving the incomplete v1 tree
model.

### Selection API

V1 capability: `selectionEnabled`, `selectedItem`, `selectItem()`,
`ContentItem.select()`, `deselect()`, `selectionChanged`, and selected styling.

V2 replacement: Component focus/blur plus `stackHeaderClick` and
`stackHeaderTouchStart` events.

Usability assessment: The v2 focus model covers keyboard and active-component
use cases more coherently. V1 selection could target arbitrary content items,
which may still be useful for workspace inspectors or designer tooling.

Disposition:

- Do not restore the old selection API as compatibility behavior.
- Preserve v2 focus/blur behavior.
- If arbitrary or multi-item selection is needed, design a separate additive
  selection model with explicit accessibility and keyboard semantics.
- Keep selection state out of persisted layout configuration unless a clear
  product requirement exists.

### Public Access To Internals

V1 exposed implementation details, including private class access through
`LayoutManager.__lm`.

Disposition: Reject. Maintain a documented public extension API instead.
Internal classes must remain free to change during modernization.

### Legacy Browser Support

Disposition: Reject. Preserve the documented modern browser support matrix and
test it in CI. Supporting obsolete browsers would prevent use of modern DOM,
module, and performance APIs while increasing security and maintenance cost.

### jQuery Dependency

Disposition: Reject. Native DOM implementation is a core modernization benefit.
No jQuery compatibility layer should be restored.

## Diversion Decision Matrix

| Diversion                                | Decision                      | Required treatment                                  |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------- |
| `GoldenLayout` to `StrelitLayout`        | Remove old name               | AST codemod and migration guide                     |
| Package and Golden-branded paths         | Remove old paths              | Import, style, and deep-path migration              |
| Namespace API to ES modules              | Complete removal              | AST call, type, and import transformations          |
| Dotted config helpers                    | Replace with named helpers    | AST rewrite with collision-safe imports             |
| Generic component APIs                   | Use as replacement            | Infer or request explicit component/state types     |
| `JsonValue` to strict serializable types | Use strict replacement        | Diagnose unsafe or non-serializable values          |
| Deprecated v1 config coercion            | Remove                        | Versioned saved-layout transformer                  |
| Deprecated v1 runtime methods            | Remove                        | AST rewrite or precise manual-review finding        |
| Automatic custom-container resize        | Reject default change         | Preserve behavior or migrate to explicit option     |
| General-purpose `lm_` selectors          | Preserve                      | Rename only `lm_goldenlayout` to `lm_strelit`       |
| Raster icons to SVG masks                | Accept replacement            | Preserve control semantics                          |
| Webpack/Karma/Jasmine to modern tooling  | Accept replacement            | Preserve runtime behavior and test coverage         |
| ESM `.js` to `.mjs`                      | Accept new package contract   | Package exports and deep-import migration           |
| Query helpers                            | Keep as Strelit feature       | Add tests and documentation                         |
| Minifier collision handling              | Accept bug fix                | Preserve old payload decoding in the migration tool |
| Pop-in null append semantics             | Accept bug fix                | Regression test and document                        |
| `loadLayout()` closes stale popouts      | Accept corrective behavior    | Regression test and migration note                  |
| Replacement metadata ordering            | Accept bug fix                | Preserve regression test                            |
| Overflow tab DOM ordering                | Accept bug fix                | Preserve accessibility/order test                   |
| React support                            | Restore as redesigned feature | Official framework adapter package                  |
| Raw nested stacks                        | Reject direct restoration     | Design composite workspace item later               |
| V1 selection API                         | Do not restore directly       | Optional modern selection subsystem                 |
| V1 internal API exposure                 | Reject                        | Public extension points only                        |
| Legacy browsers and jQuery               | Reject                        | Keep modern baseline                                |

## Corrective Roadmap

### Completed Release Baseline

1. Library, public modules, and the API demo are TypeScript checked.
2. The public API is namespace-free and recorded by API Extractor.
3. V1/v2 API and test inventories are generated and validated.
4. Source, package, style, selector, and saved-layout migration is tested.
5. Runtime defaults and general-purpose `lm_` selectors preserve v2 behavior.
6. Ambiguous transformations stop with manual-review findings.

### Future Phase: Add Framework Capabilities

1. Specify the framework adapter contract.
2. Implement `@strelit/react` using virtual components and portals.
3. Apply the same core-neutral pattern to Vue and Angular adapters.
4. Keep framework dependencies outside the core package.

### Future Phase: Research Composite Workspaces

1. Write an RFC for the nested-stack use case and alternatives.
2. Prototype a normalized composite-tab item or nested-layout boundary.
3. Validate drag/drop, focus, popout, persistence, and responsive semantics.
4. Promote it only if the design remains deterministic and maintainable.

## Readiness Assessment

The audited modernization scope is ready once the final ordered verification
passes. The modern toolchain, namespace removal, strict types, branded paths,
and behavioral corrections are retained. Every v2 declaration has a current
target, an automated migration, or a documented diagnostic/removal outcome;
all baseline tests have a disposition. React adapter work and composite
workspace research are additive future product work, not blockers for this
modernization release.
