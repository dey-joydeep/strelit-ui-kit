# Layout Workbench

Run `npm run apitest:serve` and open `http://localhost:3000/`. This is the
library's local manual verification page. The customer-facing demo belongs to
the website repository.

The page starts with the `standard` layout. The left panel loads other presets,
saves and restores a layout snapshot, and exercises component and layout
methods. Drag tabs and use header controls in the canvas. The right panel
accepts any `LayoutConfig` JSON, applies it with `loadLayout()`, and shows the
live `saveLayout()` result. **Current layout** converts saved state into an
editable `LayoutConfig`; `saveLayout()` output itself is a resolved config and
must not be passed directly to `loadLayout()`.

The **API method explorer** lists callable methods on the live layout, the
selected component and container, its stack, the latest pop-out, and the
library exports. Enter arguments as a JSON array. Reference tokens such as
`{"$ref":"selected"}` and `{"$ref":"saved"}` pass live objects to a method.
The result or an error appears beneath the call. For callbacks, custom DOM
nodes, constructors, and type-only exports, use browser DevTools with
`window.strelitApiTestApp.layout` and `window.strelitApiTestExports`; those
APIs cannot be represented as JSON.

The scenario's `popoutWholeStack` and `popInOnClose` settings control what
leaves the parent and how it returns. Pop-out windows display only their layout.
The `standard` preset uses whole-stack pop-out and returns on child close; set
`popInOnClose` to `false` in the JSON editor to display a pop-in button in the
child. Use the normal URL for manual tests. The `?smoke=1` query is for the
automated browser smoke check.

The browser suite runs in Chromium, Firefox, and WebKit with
`npm run apitest:browser-smoke`. It covers the initial layout, resizing,
configuration editing, selected runtime actions, method explorer calls, and a
pop-out round trip. The guided controls and browser suite do not assert that
every exported API is tested; use the method explorer to inspect additional API
contracts and add a focused automated test for any defect found.
