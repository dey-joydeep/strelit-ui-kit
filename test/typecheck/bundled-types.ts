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
  Stack,
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
