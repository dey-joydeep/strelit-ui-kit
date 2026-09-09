# Frameworks

Typically frameworks wrap HTML elements with their own components. Instead of an application being a tree of HTML elements, it is a tree of framework components, each of which wrap an HTML element.

With the traditional [**embedding via events**](../binding-components/index.md#embedding-via-events) component binding, Strelit Layout injects itself into this the tree of HTML elements. However with frameworks, this interferes with the tree of components. Advanced framework techniques are required to work around this problem.

[**Virtual via events**](../binding-components/index.md#virtual-via-events) component binding allows Strelit Layout to be used within framework applications without interfering with the tree of components. This is the recommended approach to binding components to Strelit Layout in framework applications.

## Angular

Use [**virtual via events**](../binding-components/index.md#virtual-via-events) binding so Angular retains ownership of component creation and DOM placement. Register the bind and unbind handlers at the layout host component, create Angular components through the application's normal component APIs, and return the host element through the virtual binding contract.

## Vue

Use [**virtual via events**](../binding-components/index.md#virtual-via-events) binding so Vue retains ownership of component instances and their host elements. The same layout APIs, including `loadLayout()` and `addComponent()`, can then operate on the component types handled by the Vue binding layer.

### Using Vue with 'embedding via events' component binding

While we recommend using 'virtual via events' component binding when integrating with Vue, some users may wish to use 'embedding via events' binding. Snippets of code demonstrating are available [here](./vue/embedding-via-events.md).

## Other Frameworks

For other frameworks, use [**Virtual via events**](../binding-components/index.md#virtual-via-events) component binding and set up the handlers using the guide in this section. Once this is done, functions that create components can be used. For example:

- `LayoutManager.loadLayout()`
- `LayoutManager.addComponent()`
