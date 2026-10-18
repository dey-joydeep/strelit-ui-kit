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

The **Header position** selector moves every stack header in the current
canvas immediately. The `standard` preset starts with all headers at the top,
placing their controls at the top right. Choose Bottom, Left, or Right to compare
placements; a later pop-out preserves the selected stack's position. A layout
loaded from JSON may show **Mixed (from layout)** until you choose one position
for all stacks. Saved snapshots retain the selected positions.

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
The `standard` preset uses whole-stack pop-out and returns on child close. The
`popoutMaximiseDemo` preset opens a child window with two side-by-side stacks:
click a stack's square control to expand it, then click again to restore the
split. Set `popInOnClose` to `false` in the JSON editor to display a pop-in
button in the child; in that mode, closing the browser window discards its
content while the pop-in button returns it. In a pop-out with one stack, closing
its last tab returns the remaining content. With multiple stacks, a tab's X
closes only that tab. Subwindows hide stack-header close and pop-out controls;
applications can still create nested pop-outs programmatically. Use the normal
URL for manual tests.
The `?smoke=1` query is for the automated browser smoke check.

The browser suite runs in Chromium, Firefox, and WebKit with
`npm run apitest:browser-smoke`. It covers the initial layout, resizing,
configuration editing, selected runtime actions, method explorer calls, and a
pop-out round trip. The guided controls and browser suite do not assert that
every exported API is tested; use the method explorer to inspect additional API
contracts and add a focused automated test for any defect found.
