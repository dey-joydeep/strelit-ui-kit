# Change summary: Initial bootstrapping of the Strelit UI Kit from Golden Layout v2, including full source tree, modernized toolchain, migration scripts, tests, and documentation

This is a large initial commit (166 files, ~44K insertions) establishing the entire Strelit UI Kit repo. The overall architecture and code quality are strong — strict TypeScript, modern toolchain (Vitest, tsup, Vite, Oxlint), clean build, and comprehensive tests. The issues below focus on correctness and robustness bugs worth fixing before this lands.

## File: src/ts/controls/browser-popout.ts

### L120: [HIGH] `close()` crashes when the popout window was blocked

If a popup is blocked and `blockedPopoutsThrowError` is `false`, `_popoutWindow` remains `null`. When `close()` is later called, `this.getStrelitInstance()` throws `UnexpectedNullError` instead of gracefully returning.

Suggested change:

```diff
  close(): void {
+   if (this._popoutWindow === null) {
+     return;
+   }
    if (this.getStrelitInstance()) {
      this.getStrelitInstance().closeWindow();
```

### L256: [MEDIUM] `_checkReadyInterval` is never cleared if the popout window is closed before initialisation

The `setInterval(..., 10)` polling in `createWindow()` is only cleared when the child window's layout is detected as initialised. If the child window is closed (or blocked) before that, the interval runs indefinitely, throwing `UnexpectedNullError` every 10ms.

Suggested change:

```diff
  private checkReady() {
    if (this._popoutWindow === null) {
-     throw new UnexpectedNullError('BPCR01844');
+     this.clearCheckReadyInterval();
+     return;
    } else {
-     if (
+     if (this._popoutWindow.closed) {
+       this.clearCheckReadyInterval();
+       this._onClose();
+     } else if (
        this._popoutWindow.__strelitInstance &&
        this._popoutWindow.__strelitInstance.isInitialised
      ) {
        this.onInitialised();
-       if (this._checkReadyInterval !== undefined) {
-         clearInterval(this._checkReadyInterval);
-         this._checkReadyInterval = undefined;
-       }
+       this.clearCheckReadyInterval();
      }
    }
  }
+
+ private clearCheckReadyInterval() {
+   if (this._checkReadyInterval !== undefined) {
+     clearInterval(this._checkReadyInterval);
+     this._checkReadyInterval = undefined;
+   }
+ }
```

## File: src/ts/layout-manager.ts

### L1561: [HIGH] `cleanupBeforeMaximisedStackDestroyed` uses wrong nullish check — dead code path

`_maximisedStack` is typed `Stack | undefined` (L310), but the guard on L1561 checks `!== null`. Since `undefined !== null` is always `true`, the guard never rejects `undefined` and the inner `=== event.target` comparison silently evaluates `undefined === <Stack>` → `false`, making the entire cleanup function a no-op when it should be active.

Suggested change:

```diff
-     this._maximisedStack !== null &&
+     this._maximisedStack !== undefined &&
      this._maximisedStack === event.target
```

## File: src/ts/items/stack.ts

### L665: [HIGH] Dropping a Row or Column onto a Stack crashes the layout

When a `Row` or `Column` content item is drag-dropped onto a `Stack` or `GroundItem`, the `onDrop` handler attempts to wrap the item by calling `stack.addChild(contentItem)`. But `Stack.addChild` strictly enforces children must be `ComponentItem`s and throws `AssertError('SACC88532')`, causing a fatal crash during drag-and-drop.

Suggested change: Remove or guard the legacy code path that attempts to add non-component items directly to a Stack. Row/Column items should be unwrapped into their component children before insertion.

## File: src/ts/strelit-layout.ts

### L377: [HIGH] Layout thrashing in virtual recting handler degrades resize performance

`handleContainerVirtualRectingRequiredEvent` calls `container.element.getBoundingClientRect()` (layout read) immediately before setting `rootElement.style.left/top/width/height` (layout writes). When multiple containers resize simultaneously, this causes **forced synchronous layouts** on every iteration.

Suggested change: Batch all reads in `fireBeforeVirtualRectingEvent`, cache the bounding rects per container, then only write in the per-container handler.

## File: src/ts/config/resolved-config.ts

### L882: [MEDIUM] Minifier returns mistyped object as `ResolvedLayoutConfig`

`minifyResolvedLayoutConfig` replaces all property keys with single-letter minified equivalents, then casts the result back to `ResolvedLayoutConfig`. Any consumer accessing standard properties on the minified object gets `undefined` at runtime, while TypeScript reports no error.

Suggested change: Return `Record<string, unknown>` or define a dedicated `MinifiedLayoutConfig` opaque type.

## File: src/ts/virtual-layout.ts

### L244: [MEDIUM] Default pop-in button element is never cleaned up on `destroy()`

`checkAddDefaultPopinButton()` creates a `<div>`, attaches a click listener, and appends it to `document.body`. When `VirtualLayout.destroy()` is called, this element and its listener are never removed — a DOM and memory leak on repeated layout creation/teardown.

### L56: [MEDIUM] `JSON.parse` of localStorage data is unguarded

If `localStorage` contains corrupt JSON for the sub-window config key, `JSON.parse` throws an unhandled error, crashing the init sequence. Wrap in `try/catch` with a graceful fallback.

### L171: [LOW] Magic 7ms `setTimeout` for sub-window init is a race condition

The arbitrary delay relies on page scripts executing within 7ms. On slow pages, the layout may initialise prematurely.

## File: src/ts/utils/event-hub.ts

### L157: [MEDIUM] `propagateToParent` can throw if the opener window is closed

The code checks `if (opener === null)` but does not check `opener.closed`. Dispatching events on a closed window throws `InvalidStateError` or `SecurityError`.

Suggested change:

```diff
  const opener = globalThis.opener as (GlobalEventHandlers & Window) | null;
- if (opener !== null) {
+ if (opener !== null && !opener.closed) {
    opener.dispatchEvent(event);
  }
```

## File: src/ts/utils/types.ts

### L183: [MEDIUM] Exponential time complexity in `isSerializableValueInternal` for DAG-shaped state

The `seen.delete(value)` call after recursion means DAG nodes reachable via multiple paths are re-evaluated every time. For deeply nested shared-reference state (e.g., a tree of config objects), this can cause exponential blowup.

Suggested change: Remove the `seen.delete(value)` line. Keep visited nodes in the `WeakSet` for the duration of the validation pass.

## File: src/ts/container/component-container.ts

### L365: [MEDIUM] Double-fault risk in `replaceComponent` rollback

If `bindComponent` fails for the new component, the catch block attempts to rebind the old component. If that rollback also throws, the container is left in a corrupt state with an unhandled exception.

Suggested change: Wrap the rollback `bindComponent` in its own `try/catch`.

### L231: [LOW] Virtual event handlers not cleaned up in `destroy()`

`destroy()` clears `stateRequestEvent` but not `virtualRectingRequiredEvent`, `virtualVisibilityChangeRequiredEvent`, or `virtualZIndexChangeRequiredEvent`, retaining bound closures.

## File: src/ts/items/row-or-column.ts

### L583: [MEDIUM] Division by zero in relative size calculations produces `NaN` dimensions

In `calculateRelativeSizes`, if all child items have `size === 0`, `total` is `0` and the loop computes `size / 0 * 100` → `NaN`. This `NaN` propagates to DOM styles (`width: NaNpx`), completely breaking rendering.

Suggested change:

```diff
+ if (total === 0) {
+   const equalShare = 100 / this.contentItems.length;
+   for (const item of this.contentItems) {
+     item.size = equalShare;
+   }
+   return;
+ }
  for (let i = 0; i < this.contentItems.length; i++) {
    this.contentItems[i].size = (this.contentItems[i].size / total) * 100;
```

### L468: [LOW] Negative DOM dimensions when splitters exceed container size

If the parent container is shrunk smaller than the combined fixed thickness of splitters, `totalSize` becomes negative, producing invalid CSS like `width: -5px`.

Suggested change: Clamp with `Math.max(0, elementHeight - totalSplitterSize)`.

## File: src/ts/controls/header.ts + src/ts/controls/tabs-container.ts

### L450 / L170: [MEDIUM] Tab layout overflows when dropdown button activates

`availableWidth` is calculated before the dropdown button becomes visible. Showing the button reduces the actual width, but tabs were already positioned using the larger width, causing the last visible tab to overflow under the controls container.

Suggested change: Subtract the dropdown button width proactively when predicting overflow, or recalculate sizes with the reduced width when `dropdownActive` flips to `true`.

## File: src/ts/controls/tabs-container.ts

### L255: [LOW] Division by zero in tab overlap calculation when a single tab exceeds available width

When `i === 0`, `overlap = (visibleTabWidth - availableWidth) / i` evaluates to `Infinity`. While JavaScript silently handles this (the exceeded-allowance check safely fails), it's a latent mathematical bug.

## File: .editorconfig

### L13: [LOW] Default `indent_size = 4` contradicts repo coding style (2-space indentation)

The `AGENTS.md` specifies 2-space indentation. The `.editorconfig` defaults to `indent_size = 4` for `[*]` and only overrides for `*.json`. TypeScript and JavaScript files will get 4-space indentation from editor auto-formatting.

Suggested change:

```diff
  [*]
  indent_style = space
- indent_size = 4
+ indent_size = 2
```

## File: test/specs/drag-tests.ts

### L78: [MEDIUM] Drag initiation uses `clientLeft`/`clientTop` (border widths) instead of bounding rect

`dragSourceElement.clientLeft` and `clientTop` return the element's border width (typically 0), not its position. Use `getBoundingClientRect()` for correct coordinates.

## File: test/vitest.setup.ts

### L92: [LOW] `getBoundingClientRect` mock always returns `x: 0, y: 0`

Nested elements do not reflect true absolute position. This may produce false positives in position-dependent layout tests (e.g., drop-target resolution).
