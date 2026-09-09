import {
  ApiError,
  BindError,
  BrowserPopout,
  ClickBubblingEvent,
  ComponentContainer,
  ComponentItem,
  ConfigurationError,
  DragSource,
  EventEmitterBubblingEvent,
  EventHub,
  Header,
  PopoutBlockedError,
  RowOrColumn,
  type SerializableValue,
  Stack,
  StrelitLayout,
  Tab,
  TouchStartBubblingEvent,
  type AreaLinkedRect,
} from '../../dist/types/index';

declare const area: AreaLinkedRect;

void area.x1;

// Exported runtime instances are created and owned by a layout.
// @ts-expect-error Direct construction is not a supported public contract.
new ApiError();
// @ts-expect-error Direct construction is not a supported public contract.
new BindError();
// @ts-expect-error Direct construction is not a supported public contract.
new BrowserPopout();
// @ts-expect-error Direct construction is not a supported public contract.
new ClickBubblingEvent();
// @ts-expect-error Direct construction is not a supported public contract.
new ComponentContainer();
// @ts-expect-error Direct construction is not a supported public contract.
new ComponentItem();
// @ts-expect-error Direct construction is not a supported public contract.
new ConfigurationError();
// @ts-expect-error Direct construction is not a supported public contract.
new DragSource();
// @ts-expect-error Direct construction is not a supported public contract.
new EventEmitterBubblingEvent();
// @ts-expect-error Direct construction is not a supported public contract.
new EventHub();
// @ts-expect-error Direct construction is not a supported public contract.
new Header();
// @ts-expect-error Direct construction is not a supported public contract.
new PopoutBlockedError();
// @ts-expect-error Direct construction is not a supported public contract.
new RowOrColumn();
// @ts-expect-error Direct construction is not a supported public contract.
new Stack();
// @ts-expect-error Direct construction is not a supported public contract.
new Tab();
// @ts-expect-error Direct construction is not a supported public contract.
new TouchStartBubblingEvent();

declare const bundledLayout: StrelitLayout;

bundledLayout.registerComponentFactoryFunction(
  'broad-state',
  (_container, state) => {
    const serializableState: SerializableValue | undefined = state;
    void serializableState;
    return undefined;
  },
);

type LabelState = { label: string };
class ValidatedComponent {
  constructor(
    _container: ComponentContainer,
    readonly state: LabelState | undefined,
    readonly virtual: boolean,
  ) {}
}

bundledLayout.registerComponentFactoryFunction(
  'validated-state',
  (_container, state: LabelState | undefined) => state,
  (state): state is LabelState | undefined =>
    state === undefined ||
    (typeof state === 'object' &&
      state !== null &&
      !Array.isArray(state) &&
      typeof state.label === 'string'),
);
bundledLayout.registerComponentConstructor(
  'validated-constructor-state',
  ValidatedComponent,
  (state): state is LabelState | undefined =>
    state === undefined ||
    (typeof state === 'object' &&
      state !== null &&
      !Array.isArray(state) &&
      typeof state.label === 'string'),
);

type LegacyState = { legacyId: number };
class LegacyComponent {
  constructor(
    _container: ComponentContainer,
    readonly state: LegacyState | undefined,
    readonly virtual: boolean,
  ) {}
}

bundledLayout.registerComponentFactoryFunction<LegacyState>(
  'legacy-explicit-factory-state',
  (_container, state) => state,
);
bundledLayout.registerComponentConstructor<LegacyState>(
  'legacy-explicit-constructor-state',
  LegacyComponent,
);
