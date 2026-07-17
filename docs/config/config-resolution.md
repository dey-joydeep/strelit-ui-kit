# Config Resolution

Strelit separates user-facing configuration from normalized runtime configuration.

- `LayoutConfig` and item config interfaces accept the Strelit input schema.
- `ResolvedLayoutConfig` and resolved item interfaces contain explicit defaults and normalized units.
- `resolveLayoutConfig()` performs defaulting and normalization without accepting Golden Layout field aliases.
- `createLayoutConfigFromResolved()` creates a serializable Strelit config.

## Normalization

Resolution performs these transformations:

- `size` strings become numeric values plus `%` or `fr` units
- `minSize` strings become numeric pixel values
- omitted settings, dimensions, and header values receive Strelit defaults
- component state and component types are copied rather than shared by reference

Invalid or obsolete Golden Layout fields are not migrated by the runtime. Run the migration tool before loading old saved layouts.

## Minification

`minifyResolvedLayoutConfig()` and `unminifyResolvedLayoutConfig()` provide compact storage for Strelit resolved configs. Their key map represents the current Strelit schema and is not a compatibility decoder for Golden Layout payloads.

Popout windows pass minified resolved configs through the `strelit-window` URL parameter and restore them through the same Strelit resolver.
