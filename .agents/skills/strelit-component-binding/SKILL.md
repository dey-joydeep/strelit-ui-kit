---
name: strelit-component-binding
description: Guide for registering and binding UI components within Strelit Layout. Use when adding component factories, managing ComponentContainer lifecycle events, or creating framework teleport wrappers.
---

# Strelit UI Kit — Component Binding & Lifecycle Skill

This skill explains how Strelit Layout binds to UI components and controls their spatial dimensions, visibility, and state persistence.

## 1. Registering Component Factories

Register component constructors or factory functions with `StrelitLayout` before calling `loadLayout()`:

```typescript
import { StrelitLayout, ComponentContainer } from 'strelit-ui-kit';

layout.registerComponentFactoryFunction(
  'MyPanel',
  (container: ComponentContainer, state: unknown) => {
    const element = document.createElement('div');
    element.classList.add('my-panel-content');
    container.element.appendChild(element);

    // Clean up DOM listeners when container destroys
    container.on('destroy', () => {
      element.remove();
    });
  },
);
```

## 2. Persisting & Restoring Component State

When `saveLayout()` is invoked, Strelit queries each component for serializable state:

```typescript
container.stateRequestEvent = () => {
  return {
    scrollPosition: element.scrollTop,
    activeFilter: currentFilter,
  };
};
```

## 3. Framework Virtual Components (React / Vue / Angular)

For modern declarative frameworks:

- Use **Virtual Components** (`VirtualLayout` mode) so framework component wrappers stay mounted inside framework portals/teleports.
- Always clean up event subscriptions inside `container.on('destroy')` to prevent detached DOM tree leaks.
