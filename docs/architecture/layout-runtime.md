# Layout Runtime

This document describes how the current runtime is assembled from `LayoutManager`, `VirtualLayout`, and `StrelitLayout`.

## Class Layering

- `LayoutManager` in `src/ts/layout-manager.ts` is the core runtime. It owns container sizing, root creation, item factories, focus state, drag sources, popouts, and layout save/load.
- `VirtualLayout` in `src/ts/virtual-layout.ts` adds subwindow detection via `strelit-window` and bind/unbind events for application-managed components.
- `StrelitLayout` in `src/ts/strelit-layout.ts` adds component registration by type name, constructor/factory instantiation, and support for virtual components whose root DOM lives outside the item node.

## Startup Flow

1. `VirtualLayout` resolves constructor inputs into `LayoutManagerConstructorParameters`.
2. `LayoutManager.init()` selects the container, creates indicators, resolves `layoutConfig`, creates `GroundItem`, and initializes the tree.
3. If running as a subwindow, the root config must be a component. The general layout settings are kept, but the root is loaded separately with `loadComponentAsRoot()`.
4. `ResizeObserver` is attached to the container after init completes.

## Load and Save

- `loadLayout()` resolves a fresh `LayoutConfig`, asks `GroundItem` to replace the root, then re-applies maximise and responsive behavior.
- `saveLayout()` walks the current tree via `calculateConfigContent()`, reconciles popouts, and returns a fully `resolved: true` config object.
- A component loaded directly as root is normalized back into a stack shape when persisted and reloaded.

## Item Creation Rule

`createContentItem()` wraps a component in a stack when the parent is not already a stack. This is a core Strelit runtime rule and explains why many APIs accept a component config but the live tree may insert a `Stack`.

## Sizing Model

- `setSize()` updates layout dimensions and forwards them to `GroundItem`.
- `updateRootSize()` forces a recursive size pass.
- `beginVirtualSizedContainerAdding()` and `endVirtualSizedContainerAdding()` batch virtual-component recting so DOM updates happen in one grouped phase.

## Focus and Maximise

- `setFocusedComponentItem()` tracks one focused component item at a time and synchronizes focus state with its parent stack.
- `setMaximisedStack()` ensures only one stack is maximised at once and coordinates minimise/maximise transitions.
