# Maintainer Docs

These pages document the current implementation, not the original Golden Layout design notes. They are intended for source-level work in `src/ts`.

## Recommended Reading Order

1. [Architecture: Layout Runtime](./architecture/layout-runtime.md)
2. [Structure: Content Tree](./structure/content-tree.md)
3. [Runtime: Component Binding](./runtime/component-binding.md)
4. [Runtime: Drag and Drop](./runtime/drag-and-drop.md)
5. [Runtime: Events and Focus](./runtime/events-and-focus.md)
6. [Config: Resolution Pipeline](./config/config-resolution.md)
7. [Architecture: Recursive Input Limits](./architecture/resource-limits.md)
8. [Migration: Modernization Status](./migration/modernization-status.md)
9. [Migration: Golden Layout to Strelit](./migration/golden-layout-to-strelit.md)
10. [Migration Tool Maintenance](./migration/migration-tool-maintenance.md)
11. [Compatibility Audit Maintenance](./architecture/compatibility-audit-maintenance.md)
12. [Verification Pipeline Maintenance](./contributing/verification-pipeline.md)

## Scope

- `LayoutManager` owns layout lifecycle, sizing, focus, popouts, and item creation.
- `VirtualLayout` adds bind/unbind hooks and subwindow bootstrapping.
- `StrelitLayout` adds component registration and virtual-component DOM handling.
- `ContentItem`, `RowOrColumn`, `Stack`, `ComponentItem`, and `GroundItem` form the runtime tree.

These docs should be updated when runtime behavior changes, especially around layout loading, saved config shape, component binding, and drag/drop behavior.
