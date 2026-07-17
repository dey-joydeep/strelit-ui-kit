---
name: strelit-layout-migration
description: Guide for migrating Golden Layout v1/v2 configurations and consumer codebases to Strelit UI Kit. Use when upgrading layout structures or automating subpath import refactoring.
---

# Strelit UI Kit — Layout Migration Skill

Use this skill when helping users migrate from legacy Golden Layout codebases or earlier internal snapshots.

## 1. Automated Import Migration Tool

The repository includes an AST/regex migration script to transform package imports:

```powershell
npm run migrate:golden-layout -- --target <path> --dry-run
npm run migrate:golden-layout -- --target <path> --from v2 --write
```

This updates:

- Package names (`golden-layout` -> `strelit-ui-kit`)
- Subpath imports (`golden-layout/dist/css/...` -> `strelit-ui-kit/dist/css/...`)
- Namespace API references and collision-safe named imports
- Recognized v1/v2 saved-layout JSON when `--from v1` or `--from v2` is supplied

Treat every reported manual-review finding as blocking. The tool deliberately does not guess receiver-dependent method calls, v1 React bindings, nested-stack semantics, computed API access, or lossy multi-root data.

## 2. Configuration Differences (v1 to Strelit UI)

- **ResolvedLayoutConfig**: Strelit UI uses strict TypeScript configuration schemas (`LayoutConfig.fromResolved()`).
- **Fractional Sizes**: Sizes are normalized; use numeric string percentages or explicit `size: number` properties on items.
- **Popouts**: Multi-window popouts use `createPopoutFromItemConfig()`. Always verify popout suppression fallback behavior when browser pop-up blockers prevent `window.open`.
