# Content Tree

The runtime tree is built from `ContentItem` subclasses in `src/ts/items`.

## Node Types

- `GroundItem`: invisible root wrapper owned by `LayoutManager`
- `RowOrColumn`: split container that manages child percentages and splitters
- `Stack`: tabbed container for component items
- `ComponentItem`: leaf node that owns a `ComponentContainer`

## Base Contract

`ContentItem` in `src/ts/items/content-item.ts` provides:

- parent/child relationships
- recursive init and destroy
- tree queries like `getItemsById()` and `getComponentItemsByType()`
- config serialization through `toConfig()`
- event bubbling through `EventEmitter.tryBubbleEvent()`

`addChild()` wires tree ownership first. Concrete subclasses are responsible for DOM placement and resize behavior.

## Structural Rules

- A stack can only contain `ComponentItem` children.
- A row or column can contain rows, columns, stacks, or components. Components are normalized into stacks by `LayoutManager.createContentItem()`.
- When a `RowOrColumn` is reduced to one child and is closable, it replaces itself with that remaining child.

## Stack Behavior

`Stack` is responsible for:

- building header state from item-level, component-level, then layout-level header config
- creating tabs for each component
- hiding all inactive components
- emitting `activeContentItemChanged`
- owning maximise and minimise behavior

The active component is selected during init from `activeItemIndex`, then shown while siblings remain hidden.

## Row and Column Behavior

`RowOrColumn` maintains percentage-based child sizing and inserts `Splitter` instances between adjacent children. Size updates follow this pattern:

1. normalize relative percentages
2. convert percentages to absolute pixels
3. subtract splitter width from the main axis
4. assign remaining rounding pixels from the start of the list

The current implementation expects live child sizes to be percent-based after normalization.
