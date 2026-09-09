# Strelit UI Kit Toolchain Documentation

## Requirements

### JS Code

- Author strict TypeScript and target the repository's supported modern runtime
- Produce modern CommonJS + ESM output from TypeScript source
- Keep build outputs simple and fast enough for local iteration
- Do **not** bundle any dependencies.

### Styles

- Use a CSS preprocessor to get better scalability
- Include an autoprefixer to compile the styles to all supported browsers
- Separate themes from base style to be imported by default
- Keep the option to ship sass mixins such as Angular Material

## Idea

- Prefer `tsup` for library JavaScript output, `tsc` for type declarations, and `Vite` only for the demo app
- Use the repository CSS build script for Less output and preserve distributable
  Sass sources without introducing webpack loaders.
- Ship it roughly in this directory structure

---

- root
  - src (input code)
    - ts
      - layout-manager.ts
    - less
      - base.less
      - theme-dark.less
      - theme-light.less
    - index.js
  - dist (output products)
    - css
      - strelit.css
    - cjs
      - index.js
    - esm
      - index.mjs
    - types
      - index.d.ts

---
