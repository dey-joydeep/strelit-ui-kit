# Drag and Drop

Drag and drop is implemented by `DragSource`, `DragListener`, `DragProxy`, and item-specific drop handling.

## External Drag Sources

`LayoutManager.newDragSource()` creates a `DragSource` around any DOM element. On drag start:

1. a component config is built from either a fixed type or a callback
2. a temporary `ComponentItem` is created
3. that item is attached to a dummy `GroundItem`
4. a `DragProxy` takes over visual dragging

The dummy ground exists because runtime items require a non-null parent, even during external drag creation.

## DragProxy Lifecycle

`DragProxy` performs these steps:

1. builds a temporary stack-like DOM shell
2. removes the dragged component from its current parent without destroying it
3. appends the proxy to `document.body`
4. asks `LayoutManager` to calculate droppable item areas
5. updates highlight state while pointer movement continues

When `constrainDragToContainer` is enabled, pointer coordinates are clamped to the ground item bounds.

## Drop Resolution

On drop, the runtime chooses in this order:

1. current valid area
2. last valid area
3. original parent
4. destroy the orphaned component item

`Stack` and `ContentItem` override `onDrop()` and `highlightDropZone()` to provide target-specific behavior. The base `ContentItem` implementation simply adds the child.

## Runtime Notes

- Dragging a focused component blurs it first; focus is later re-established by normal activation logic.
- `transitionIndicator` is still used for visual transition from the source element to the proxy.
- The proxy mirrors header orientation when dragged from a stack with sided headers.
