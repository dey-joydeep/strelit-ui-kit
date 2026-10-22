# Strelit UI Kit 1.0 supported contract

This document defines the supported surface for the first stable Strelit UI Kit release. It is a Strelit contract, not a promise that every Golden Layout v1 or v2 API or incidental behavior is retained. The active Bridge phase in [product evolution policy](./product-evolution-policy.md) remains in force.

## Public API and packaging

- The root `strelit-ui-kit` entry point and its rolled-up declarations are the supported JavaScript and TypeScript API. [The API report](../../etc/strelit-ui-kit.api.md) records the exact exported signatures for each release. Internal source paths and `@internal` symbols are outside this contract.
- The package exposes ESM and CommonJS entry points through `package.json` exports. The browser IIFE is available at `strelit-ui-kit/dist/iife/index.global.js` and exposes `window.strelitUIKit`, including `window.strelitUIKit.StrelitLayout`. It does not create `window.StrelitLayout`.
- Published style entry points are `strelit-ui-kit/dist/css/strelit-base.css` and `strelit-ui-kit/dist/css/themes/*.css`; corresponding Less and SCSS assets are exported from `dist/less/*` and `dist/scss/*`. The documented CSS class namespace and these import paths follow major-version compatibility rules.
- The separately named JSR `@strelit/core` source package contains the TypeScript API but no CSS. Browser consumers must load the matching `strelit-ui-kit` npm release's base stylesheet and one theme from the paths above. Keep both package versions aligned.
- Node.js 24 is the package metadata baseline. The browser support target is the matrix in `package.json`; CI browser checks and the API demo are release evidence, not a guarantee for every device build.

## Layout and saved configuration

- Applications construct `StrelitLayout`, register components, call `loadLayout()` with the Strelit `LayoutConfig` schema, and call `saveLayout()` to capture resolved state. The supported schema and normalization rules are documented in [config resolution](../config/config-resolution.md); the corresponding exported types and functions are part of the API report.
- Strelit 1.x maintains the documented `LayoutConfig` and resolved saved-layout contract. Changes that make valid 1.x saved layouts unloadable or silently reinterpret them require a major version or an explicit migration path. Configuration limits and diagnostics remain part of the documented contract.
- Golden Layout configurations and constructor patterns require the [migration guide and tool](../migration/index.md). Runtime aliases or automatic Golden Layout config coercion are not included in the 1.0 contract.

## Versioning and release boundary

The first published stable package is `1.0.0`; subsequent releases follow [semantic versioning policy](../../VERSIONING.md). Breaking changes to the supported API, saved configuration, styling namespace, package entry points, or documented consumer behavior require a new major version. Additive compatible features use a minor version; compatible fixes use a patch version.

This contract does not itself claim that npm, JSR, CDN URLs, or downloadable archives have been published. Each channel becomes available only after its release artifact is verified and published. The separately named JSR package is planned as `@strelit/core`; its source typing checks must pass before publication. Native operating-system applications require a separate product decision.
