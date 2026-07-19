import { AssertError } from '../errors/internal-error';

/**
 * Identifies supported i18n string id values.
 * @public
 */
export const enum I18nStringId {
  /** Uses the popout cannot be created with ground item config value. */
  PopoutCannotBeCreatedWithGroundItemConfig,
  /** Uses the please register aconstructor function value. */
  PleaseRegisterAConstructorFunction,
  /** Uses the component type not registered and bind component event handler not assigned value. */
  ComponentTypeNotRegisteredAndBindComponentEventHandlerNotAssigned,
  /** Uses the component is already registered value. */
  ComponentIsAlreadyRegistered,
  /** Uses the component is not virtual value. */
  ComponentIsNotVirtual,
  /** Uses the virtual component does not have root html element value. */
  VirtualComponentDoesNotHaveRootHtmlElement,
  /** Uses the item config is not type component value. */
  ItemConfigIsNotTypeComponent,
  /** Uses the invalid number part in size string value. */
  InvalidNumberPartInSizeString,
  /** Uses the unknown unit in size string value. */
  UnknownUnitInSizeString,
  /** Uses the unsupported unit in size string value. */
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
  ComponentIsNotVirtual: {
    id: I18nStringId.ComponentIsNotVirtual,
    default: 'Component is not virtual. Requires rootHtmlElement field/getter',
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

/**
 * Provides the i18n string count.
 * @public
 */
export const i18nStringCount = Object.keys(i18nStringInfosObject).length;

/**
 * Provides the i18n strings.
 * @public
 */
export const i18nStrings = Array<string>(i18nStringCount);

/**
 * Performs the check i18n strings initialise operation.
 * @public
 */
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
