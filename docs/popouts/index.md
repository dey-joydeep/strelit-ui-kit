# Using Popouts

Popouts are supported, although the scope is more limited than in the original v1. Popouts are enabled by default for all content items. Popouts are disabled by either setting `{ popout: false }` in the `header` configuration or when a component is not closable. Also, as a popout user, if you are using registration binding, make sure to register all component types before initializing the Strelit Layout instance in your child windows.

Popouts are automatically closed when the page unloads because `closePopoutsOnUnload` defaults to `true`. Set `settings.closePopoutsOnUnload` to `false` only when the application will manage popout lifetime itself, for example by calling `LayoutManager.closeAllOpenPopouts()` explicitly.

Popout examples are available in the `standard` and `tabDropdown` layouts within the apitest application.

EventHub can be used to broadcast messages and events to every other window in
the layout tree. The sending layout does not receive its own broadcast. The
LayoutManager.eventHub.emitUserBroadcast() function is used to broadcast
messages. Messages can be received by listening to “userBroadcast” events. For
example:

```typescript
layoutManager.eventHub.on(
  'userBroadcast',
  (...ev: EventEmitterUnknownParams) => {
    // respond to user broadcast event
  },
);
```

See event-component.ts in apitest for a complete example of broadcasting user messages.

## Limitations

- The EventHub is restricted to `userBroadcast` events, other event types will not be broadcasted between windows.
- This means the you have to take care of propagating state changes between windows yourself.
