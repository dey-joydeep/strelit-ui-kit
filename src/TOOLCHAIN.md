# Strelit UI Kit Toolchain

This file describes the current source and build layout for contributors. Run
commands from the repository root with Node.js 24.x and `npm ci` dependencies.

## Source

- `src/index.ts` is the public TypeScript entry point.
- `src/ts/` contains the layout runtime, config, controls, items, and utilities.
- `src/less/` and `src/scss/` contain distributable styles and themes.
- `apitest/` is the Vite browser workbench; it is not part of the npm package.

## Build output

`npm run build` runs tsup, TypeScript, the stylesheet build, and API Extractor.
The generated `dist/` directory is ignored by Git and contains:

- `dist/cjs/index.js` and `dist/esm/index.mjs` for package consumers;
- `dist/iife/index.global.js` for script-tag consumers, exposed as
  `window.strelitUIKit`;
- `dist/types/index.d.ts` for the supported declaration surface;
- `dist/css/strelit-base.css` and `dist/css/themes/*.css`, plus Less and SCSS
  sources.

The tracked API report at `etc/strelit-ui-kit.api.md` records the public
declaration shape. See the [verification pipeline](../docs/contributing/verification-pipeline.md)
and [1.0 support contract](../docs/architecture/stable-contract-1.0.md) for
the checks and compatibility boundary.
