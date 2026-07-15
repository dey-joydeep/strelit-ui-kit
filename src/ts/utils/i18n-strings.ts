import { AssertError } from '../errors/internal-error';

/** @public */
export const enum I18nStringId {
  PopoutCannotBeCreatedWithGroundItemConfig,
  PleaseRegisterAConstructorFunction,
  ComponentTypeNotRegisteredAndBindComponentEventHandlerNotAssigned,
  ComponentIsAlreadyRegistered,
  ComponentIsNotVirtuable,
  VirtualComponentDoesNotHaveRootHtmlElement,
  ItemConfigIsNotTypeComponent,
  InvalidNumberPartInSizeString,
  UnknownUnitInSizeString,
  UnsupportedUnitInSizeString,
}

/** @internal */
interface I18nStringInfo {
  readonly id: I18nStringId;
  readonly default: string;
}

/** @internal */
type I18nStringInfosObject = {
  [id in keyof typeof I18nStringId]: I18nStringInfo;
};

/** @internal */
const i18nStringInfosObject: I18nStringInfosObject = {
  PopoutCannotBeCreatedWithGroundItemConfig: {
    id: I18nStringId.PopoutCannotBeCreatedWithGroundItemConfig,
    default: 'Popout cannot be created with ground ItemConfig',
  },
  PleaseRegisterAConstructorFunction: {
    id: I18nStringId.PleaseRegisterAConstructorFunction,
    default: 'Please register a constructor function',
  },
  ComponentTypeNotRegisteredAndBindComponentEventHandlerNotAssigned: {
    id: I18nStringId.ComponentTypeNotRegisteredAndBindComponentEventHandlerNotAssigned,
    default:
      'Component type not registered and BindComponentEvent handler not assigned',
  },
  ComponentIsAlreadyRegistered: {
    id: I18nStringId.ComponentIsAlreadyRegistered,
    default: 'Component is already registered',
  },
  ComponentIsNotVirtuable: {
    id: I18nStringId.ComponentIsNotVirtuable,
    default:
      'Component is not virtuable. Requires rootHtmlElement field/getter',
  },
  VirtualComponentDoesNotHaveRootHtmlElement: {
    id: I18nStringId.VirtualComponentDoesNotHaveRootHtmlElement,
    default: 'Virtual component does not have getter "rootHtmlElement"',
  },
  ItemConfigIsNotTypeComponent: {
    id: I18nStringId.ItemConfigIsNotTypeComponent,
    default: 'ItemConfig is not of type component',
  },
  InvalidNumberPartInSizeString: {
    id: I18nStringId.InvalidNumberPartInSizeString,
    default: 'Invalid number part in size string',
  },
  UnknownUnitInSizeString: {
    id: I18nStringId.UnknownUnitInSizeString,
    default: 'Unknown unit in size string',
  },
  UnsupportedUnitInSizeString: {
    id: I18nStringId.UnsupportedUnitInSizeString,
    default: 'Unsupported unit in size string',
  },
};

const i18nStringInfos = Object.values(i18nStringInfosObject);
let i18nStringsInitialised = false;

/** @public */
export const i18nStringCount = Object.keys(i18nStringInfosObject).length;

/** @public */
export const i18nStrings = new Array<string>(i18nStringCount);

/** @public */
export function checkI18nStringsInitialise(): void {
  if (!i18nStringsInitialised) {
    for (let i = 0; i < i18nStringCount; i++) {
      const info = i18nStringInfos[i];
      if (info.id !== i) {
        throw new AssertError('INSI00110', `${i}: ${info.id}`);
      } else {
        i18nStrings[i] = info.default;
      }
    }
  }
  i18nStringsInitialised = true;
}
