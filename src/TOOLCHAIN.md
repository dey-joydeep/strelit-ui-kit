# Strelit UI Kit Toolchain Documentation

## Requirements

### JS Code

- Use up-to-date JavaScript, with an option to upgrade to typescript
- Produce modern CommonJS + ESM output from TypeScript source
- Keep build outputs simple and fast enough for local iteration
- Produce an ES5 + UMD bundle to consume baremetal
- Do **not** bundle any dependencies.

### Styles

- Use a CSS preprocessor to get better scalability
- Include an autoprefixer to compile the styles to all supported browsers
- Separate themes from base style to be imported by default
- Keep the option to ship sass mixins such as Angular Material

## Idea

- Prefer `tsup` for library JavaScript output, `tsc` for type declarations, and `Vite` only for the demo app
- Once upgrade to TS is done -> replace babel-loader by ts-loader
- Use less/sass-loader to transpile styles.
- Ship it roughly in this directory structure

---

- root
    - src (input code)
        - js
            - LayoutManager.js
        - less
            - base.less
            - theme-dark.less
            - theme-light.less
        - index.js
    - dist (output products)
        - css
            - strelit.css
        - umd (completely bundled variant)
            - strelit.min.js
            - strelit.min.js.map
            - strelit.js
        - module (ES5 code, ESM modules)
            - index.js
            - js
                - LayoutManager.js
        - es2015 (ES6 code, ESM modules)
            - index.js
            - js
                - LayoutManager.js

---
