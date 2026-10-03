# Component Focus

Components can have focus. This is analagous to HTML elements having focus.

Only one component in a layout can have focus at any time (or alternatively, no component has focus). Similarly to HTML elements, a component will be focused when you click on its tab. You can programatically give a component focus by calling the `focus()` method on its container. Likewise, you can remove focus from a container by calling `ComponentContainer.blur()`.

Clicking on HTML within a component will not automatically give a Strelit Layout component focus. However this can be achieved by listening to the bubbling `click` and/or `focusin` events and calling `ComponentContainer.focus()` in these events' handlers. The `apitest` demonstrates this technique.

A focused component's tab and header HTML elements will contain the class `lm_focused`. This can be used to highlight the focused tab and or header. The `apitest` styles add a focused-tab highlight alongside the `strelit-light-theme.less` theme. Applications can style the `lm_focused` selector in their own CSS, LESS, or SCSS to show focus.
