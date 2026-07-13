# Config Resolution

The public config pipeline starts in `src/ts/config/config.ts` and ends in `src/ts/config/resolved-config.ts`.

## Two Shapes

- `LayoutConfig` and `ItemConfig` accept user-facing input, legacy fields, and shorthand values.
- `ResolvedLayoutConfig` and `ResolvedItemConfig` are the normalized runtime form used by layout creation and persistence.

## Item Resolution

`ItemConfig.resolve()` dispatches by `type` and normalizes:

- `size` into numeric `size` plus `sizeUnit`
- legacy `width` and `height` into percent sizing
- `minSize` or legacy `minWidth` and `minHeight` into pixel units
- legacy array ids into a single string id

Important current rule: row and column runtime sizing is percent-based after resolution and normalization, even if the source used fractional units.

## Layout Resolution

`LayoutConfig.resolve()` produces a fully populated `ResolvedLayoutConfig` with:

- `root`
- `openPopouts`
- `settings`
- `dimensions`
- `header`
- `resolved: true`

Defaults live in `ResolvedLayoutConfig.Settings.defaults`, `Dimensions.defaults`, and `Header.defaults`.

## Persistence Rules

- `saveLayout()` always emits resolved config.
- `ResolvedLayoutConfig.minifyConfig()` and `unminifyConfig()` still support the older compact storage format.
- Popout configs carry their own `window`, `parentId`, and `indexInParent` metadata.

## Subwindow Boot

`VirtualLayout` detects subwindows through the `gl-window` query parameter, reads the saved config from `localStorage`, unminifies it, and converts it back through `LayoutConfig.fromResolved()`. That boot path is why config compatibility remains important even after API modernization.
