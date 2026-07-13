# Events and Focus

The event system is centered on `EventEmitter` in `src/ts/utils/event-emitter.ts`.

## Event Model

- Named listeners are stored per event key.
- Every emitted event also emits `__all`.
- `ContentItem` subclasses override bubbling so item events can propagate upward with `EventEmitterBubblingEvent`.

Important built-in events include:

- lifecycle: `initialised`, `destroy`, `beforeItemDestroyed`, `itemDestroyed`
- layout state: `stateChanged`, `resize`, `maximised`, `minimised`
- interaction: `focus`, `blur`, `dragStart`, `drag`, `dragStop`
- stack/header: `activeContentItemChanged`, `stackHeaderClick`, `tabCreated`

## Focus Model

The runtime tracks one focused `ComponentItem` in `LayoutManager`.

- `ComponentContainer.focus()` and `blur()` delegate to the owning item and manager.
- `LayoutManager.setFocusedComponentItem()` updates both the leaf component and its parent stack.
- When focus moves within the same stack, the stack focus state is preserved instead of being torn down and rebuilt.

This means stack-level focus visuals represent whether one of its component children is focused.

## Visibility and Resize

`ComponentContainer.setVisibility()` separates visibility changes from size changes:

- hidden containers emit `hide`
- shown containers emit `show` only when they become visible with usable dimensions
- virtual containers request external recting and visibility updates before normal resize/show events are emitted

## Popout and Broadcast

- `windowOpened` and `windowClosed` are emitted from `LayoutManager` as `BrowserPopout` instances change state.
- Cross-window app events are routed through `EventHub` using the `userBroadcast` event family.
