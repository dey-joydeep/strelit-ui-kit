# Modernization Status

This page records the current modernization direction of the `strelit-ui-kit` codebase.

## Completed

- migrated tests to Vitest with `jsdom`
- replaced demo bundling with Vite
- standardized linting on Oxlint only
- added Prettier
- kept TypeScript and API Extractor
- switched docs generation to TypeDoc
- removed `@microsoft/api-documenter`

## Source-Level Cleanup Already Applied

- several namespace-style utility exports were converted to standard module exports
- component registration generics were tightened in `StrelitLayout`
- a focus-state bug in `LayoutManager.setFocusedComponentItem()` was fixed
- demo imports and API test entry wiring were updated for the new build path

## Remaining Technical Direction

- continue replacing legacy compatibility surfaces where safe
- reduce deprecated constructor and bind/unbind paths over time
- keep source compatibility improvements explicit in migration notes
- document any intentional divergence from v1 behavior before making it public API

## What To Watch

- TypeDoc warnings still indicate stale TSDoc links and parameter names
- popout and subwindow behavior remains a compatibility-sensitive area
- any deeper jQuery-removal or API-surface reshaping must be checked against the v1-to-v2 mapping work
