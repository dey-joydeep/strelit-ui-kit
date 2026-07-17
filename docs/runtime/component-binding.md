# Component Binding

Component binding happens through `ComponentContainer`, `VirtualLayout`, and `StrelitLayout`.

## Binding Paths

There are two runtime binding modes:

- registered binding via `StrelitLayout.registerComponentConstructor()` or `registerComponentFactoryFunction()`
- external binding via `VirtualLayout.bindComponentEvent` and `unbindComponentEvent`

## Registered Components

`StrelitLayout.bindComponent()` resolves a component instantiator in this order:

1. registered type name from `_componentTypesMap`
2. `VirtualLayout` bind hooks if no registration exists

Component state is cloned before construction, so constructors and factory functions do not receive the original config object by reference.

## Virtual Components

When a registration is marked `virtual: true`:

- the instance must expose `rootHtmlElement`
- the root element is forced to absolute positioning
- that root is appended to the layout container, not to the component item element
- container callbacks are attached for recting, visibility, and z-index changes

The item node itself is left with `position: static`, while the virtual root is moved and sized separately.

## ComponentContainer Responsibilities

`ComponentContainer` owns:

- current width and height
- visibility state
- logical z-index
- component state handoff
- replace-without-relayout through `replaceComponent()`

For non-virtual components, `setSizeToNodeSize()` emits `resize` directly. For virtual components, it queues recting through the layout manager batch path.

## Unbinding

- Registered virtual roots are removed from the layout container in `StrelitLayout.unbindComponent()`.
- Non-registered or externally bound components fall back to `VirtualLayout.unbindComponent()`.
- `ComponentContainer.releaseComponent()` emits `beforeComponentRelease` before delegating to layout-level unbind logic.
