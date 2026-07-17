import { AssertError, UnreachableCaseError } from '../errors/internal-error';
import { translateObject as translateMinifiedConfigObject } from '../utils/config-minifier';
import {
  ComponentType,
  ItemType,
  ResponsiveMode,
  SerializableValue,
  Side,
  SizeUnit,
} from '../utils/types';
import { deepCloneValue } from '../utils/utils';

/** @public */
export interface ResolvedItemConfig {
  // see ItemConfig for comments
  readonly type: ItemType;
  readonly content: readonly ResolvedItemConfig[];
  readonly size: number;
  readonly sizeUnit: SizeUnit;
  readonly minSize: number | undefined;
  readonly minSizeUnit: SizeUnit;
  // id no longer specifies whether an Item is maximised.  This is now done by HeaderItemConfig.maximised
  readonly id: string;
  readonly isClosable: boolean;
}

/** @internal */
export const resolvedItemConfigDefaults: ResolvedItemConfig = {
  type: ItemType.ground, // not really default but need something
  content: [],
  size: 1,
  sizeUnit: SizeUnit.Fractional,
  minSize: undefined,
  minSizeUnit: SizeUnit.Pixel,
  id: '',
  isClosable: true,
} as const;

/** @public
 * Creates a copy of the original ResolvedItemConfig using an alternative content if specified
 */
export function createResolvedItemConfigCopy(
  original: ResolvedItemConfig,
  content?: ResolvedItemConfig[],
): ResolvedItemConfig {
  switch (original.type) {
    case ItemType.ground:
    case ItemType.row:
    case ItemType.column:
      return createResolvedRowOrColumnItemConfigCopy(
        original as ResolvedRowOrColumnItemConfig,
        content as ResolvedRowOrColumnItemConfigChildItemConfig[],
      );

    case ItemType.stack:
      return createResolvedStackItemConfigCopy(
        original as ResolvedStackItemConfig,
        content as ResolvedComponentItemConfig[],
      );

    case ItemType.component:
      return createResolvedComponentItemConfigCopy(
        original as ResolvedComponentItemConfig,
      );

    default:
      throw new UnreachableCaseError(
        'CICC91354',
        original.type,
        'Invalid Config Item type specified',
      );
  }
}

/** @public */
export function createResolvedItemConfigDefault(
  type: ItemType,
): ResolvedItemConfig {
  switch (type) {
    case ItemType.ground:
      throw new AssertError('CICCDR91562'); // Get default root from LayoutConfig
    case ItemType.row:
    case ItemType.column:
      return createResolvedRowOrColumnItemConfigDefault(type);

    case ItemType.stack:
      return createResolvedStackItemConfigDefault();

    case ItemType.component:
      return createResolvedComponentItemConfigDefault();

    default:
      throw new UnreachableCaseError(
        'CICCDD91563',
        type,
        'Invalid Config Item type specified',
      );
  }
}

/** @public */
export function isResolvedComponentItemConfig(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedComponentItemConfig {
  return itemConfig.type === ItemType.component;
}

/** @public */
export function isResolvedStackItemConfig(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedStackItemConfig {
  return itemConfig.type === ItemType.stack;
}

/** @internal */
export function isResolvedGroundItemConfig(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedGroundItemConfig {
  return itemConfig.type === ItemType.ground;
}

// Stack or Component
/** @public */
export interface ResolvedHeaderedItemConfig extends ResolvedItemConfig {
  header: ResolvedHeaderedItemConfigHeader | undefined; // undefined means get header settings from LayoutConfig
  readonly maximised: boolean;
}

/** @public */
export const resolvedHeaderedItemConfigDefaultMaximised = false;

/** @public */
export interface ResolvedHeaderedItemConfigHeader {
  // undefined means get property value from LayoutConfig
  readonly show: false | Side | undefined;
  readonly popout: false | string | undefined;
  readonly maximise: false | string | undefined;
  readonly close: string | undefined;
  readonly minimise: string | undefined;
  readonly tabDropdown: false | string | undefined;
}

/** @public */
export function createResolvedHeaderedItemConfigHeaderCopy(
  original: ResolvedHeaderedItemConfigHeader | undefined,
  show?: false | Side,
): ResolvedHeaderedItemConfigHeader | undefined {
  if (original === undefined) {
    return undefined;
  } else {
    return {
      show: show ?? original.show,
      popout: original.popout,
      close: original.close,
      maximise: original.maximise,
      minimise: original.minimise,
      tabDropdown: original.tabDropdown,
    };
  }
}

/** @public */
export interface ResolvedStackItemConfig extends ResolvedHeaderedItemConfig {
  readonly type: 'stack';
  readonly content: ResolvedComponentItemConfig[];
  /** The index of the active item in the Stack.  Only undefined if the Stack is empty. */
  readonly activeItemIndex: number | undefined;
}

/** @public */
export const resolvedStackItemConfigDefaultActiveItemIndex = 0;

/** @public */
export function createResolvedStackItemConfigCopy(
  original: ResolvedStackItemConfig,
  content?: ResolvedComponentItemConfig[],
): ResolvedStackItemConfig {
  const result: ResolvedStackItemConfig = {
    type: original.type,
    content:
      content !== undefined
        ? createResolvedStackItemConfigContentCopy(content)
        : createResolvedStackItemConfigContentCopy(original.content),
    size: original.size,
    sizeUnit: original.sizeUnit,
    minSize: original.minSize,
    minSizeUnit: original.minSizeUnit,
    id: original.id,
    maximised: original.maximised,
    isClosable: original.isClosable,
    activeItemIndex: original.activeItemIndex,
    header: createResolvedHeaderedItemConfigHeaderCopy(original.header),
  };
  return result;
}

/** @public */
export function createResolvedStackItemConfigContentCopy(
  original: ResolvedComponentItemConfig[],
): ResolvedComponentItemConfig[] {
  const count = original.length;
  const result = Array<ResolvedComponentItemConfig>(count);
  for (let i = 0; i < count; i++) {
    result[i] = createResolvedItemConfigCopy(
      original[i],
    ) as ResolvedComponentItemConfig;
  }
  return result;
}

/** @public */
export function createResolvedStackItemConfigDefault(): ResolvedStackItemConfig {
  const result: ResolvedStackItemConfig = {
    type: ItemType.stack,
    content: [],
    size: resolvedItemConfigDefaults.size,
    sizeUnit: resolvedItemConfigDefaults.sizeUnit,
    minSize: resolvedItemConfigDefaults.minSize,
    minSizeUnit: resolvedItemConfigDefaults.minSizeUnit,
    id: resolvedItemConfigDefaults.id,
    maximised: resolvedHeaderedItemConfigDefaultMaximised,
    isClosable: resolvedItemConfigDefaults.isClosable,
    activeItemIndex: resolvedStackItemConfigDefaultActiveItemIndex,
    header: undefined,
  };
  return result;
}

/** @public */
export interface ResolvedComponentItemConfig extends ResolvedHeaderedItemConfig {
  // see ComponentItemConfig for comments
  readonly type: 'component';
  readonly content: [];
  readonly title: string;
  readonly reorderEnabled: boolean; // Takes precedence over LayoutConfig.reorderEnabled.
  /**
   * The name of the component as specified in layout.registerComponent. Mandatory if type is 'component'.
   */
  readonly componentType: ComponentType;
  readonly componentState?: SerializableValue;
}

/** @public */
export const resolvedComponentItemConfigDefaultReorderEnabled = true;

/** @public */
export function resolveComponentTypeName(
  itemConfig: ResolvedComponentItemConfig,
): string | undefined {
  const componentType = itemConfig.componentType;
  if (typeof componentType === 'string') {
    return componentType;
  } else {
    return undefined;
  }
}

/** @public */
export function createResolvedComponentItemConfigCopy(
  original: ResolvedComponentItemConfig,
): ResolvedComponentItemConfig {
  const result: ResolvedComponentItemConfig = {
    type: original.type,
    content: [],
    size: original.size,
    sizeUnit: original.sizeUnit,
    minSize: original.minSize,
    minSizeUnit: original.minSizeUnit,
    id: original.id,
    maximised: original.maximised,
    isClosable: original.isClosable,
    reorderEnabled: original.reorderEnabled,
    title: original.title,
    header: createResolvedHeaderedItemConfigHeaderCopy(original.header),
    componentType: original.componentType,
    componentState: deepCloneValue(
      original.componentState,
    ) as SerializableValue,
  };
  return result;
}

/** @public */
export function createResolvedComponentItemConfigDefault(
  componentType: ComponentType = '',
  componentState?: SerializableValue,
  title = '',
): ResolvedComponentItemConfig {
  const result: ResolvedComponentItemConfig = {
    type: ItemType.component,
    content: [],
    size: resolvedItemConfigDefaults.size,
    sizeUnit: resolvedItemConfigDefaults.sizeUnit,
    minSize: resolvedItemConfigDefaults.minSize,
    minSizeUnit: resolvedItemConfigDefaults.minSizeUnit,
    id: resolvedItemConfigDefaults.id,
    maximised: resolvedHeaderedItemConfigDefaultMaximised,
    isClosable: resolvedItemConfigDefaults.isClosable,
    reorderEnabled: resolvedComponentItemConfigDefaultReorderEnabled,
    title,
    header: undefined,
    componentType,
    componentState,
  };
  return result;
}

/** @public */
export function createComponentTypeCopy(
  componentType: ComponentType,
): ComponentType {
  return deepCloneValue(componentType) as ComponentType;
}

/** Base for Root or RowOrColumn ItemConfigs
 * @public
 */
export interface ResolvedRowOrColumnItemConfig extends ResolvedItemConfig {
  readonly type: 'row' | 'column';
  /** Note that RowOrColumn ResolvedItemConfig contents, can contain ComponentItem itemConfigs.  However
   * when ContentItems are created, these ComponentItem itemConfigs will create a Stack with a child ComponentItem.
   */
  readonly content: readonly (
    | ResolvedRowOrColumnItemConfig
    | ResolvedStackItemConfig
    | ResolvedComponentItemConfig
  )[];
}

/** @public */
export type ResolvedRowOrColumnItemConfigChildItemConfig =
  | ResolvedRowOrColumnItemConfig
  | ResolvedStackItemConfig
  | ResolvedComponentItemConfig;

/** @public */
export function isResolvedRowOrColumnItemConfigChild(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedRowOrColumnItemConfigChildItemConfig {
  switch (itemConfig.type) {
    case ItemType.row:
    case ItemType.column:
    case ItemType.stack:
    case ItemType.component:
      return true;
    case ItemType.ground:
      return false;
    default:
      throw new UnreachableCaseError('CROCOSPCICIC13687', itemConfig.type);
  }
}

/** @public */
export function createResolvedRowOrColumnItemConfigCopy(
  original: ResolvedRowOrColumnItemConfig,
  content?: ResolvedRowOrColumnItemConfigChildItemConfig[],
): ResolvedRowOrColumnItemConfig {
  const result: ResolvedRowOrColumnItemConfig = {
    type: original.type,
    content:
      content !== undefined
        ? createResolvedRowOrColumnItemConfigContentCopy(content)
        : createResolvedRowOrColumnItemConfigContentCopy(original.content),
    size: original.size,
    sizeUnit: original.sizeUnit,
    minSize: original.minSize,
    minSizeUnit: original.minSizeUnit,
    id: original.id,
    isClosable: original.isClosable,
  };
  return result;
}

/** @public */
export function createResolvedRowOrColumnItemConfigContentCopy(
  original: readonly ResolvedRowOrColumnItemConfigChildItemConfig[],
): ResolvedRowOrColumnItemConfigChildItemConfig[] {
  const count = original.length;
  const result = Array<ResolvedRowOrColumnItemConfigChildItemConfig>(count);
  for (let i = 0; i < count; i++) {
    result[i] = createResolvedItemConfigCopy(
      original[i],
    ) as ResolvedRowOrColumnItemConfigChildItemConfig;
  }
  return result;
}

/** @public */
export function createResolvedRowOrColumnItemConfigDefault(
  type: 'row' | 'column',
): ResolvedRowOrColumnItemConfig {
  const result: ResolvedRowOrColumnItemConfig = {
    type,
    content: [],
    size: resolvedItemConfigDefaults.size,
    sizeUnit: resolvedItemConfigDefaults.sizeUnit,
    minSize: resolvedItemConfigDefaults.minSize,
    minSizeUnit: resolvedItemConfigDefaults.minSizeUnit,
    id: resolvedItemConfigDefaults.id,
    isClosable: resolvedItemConfigDefaults.isClosable,
  };
  return result;
}

/**
 * RootItemConfig is the topmost ResolvedItemConfig specified by the user.
 * Note that it does not have a corresponding contentItem.  It specifies the one and only child of the Ground ContentItem
 * Note that RootItemConfig can be an ComponentItem itemConfig.  However when the Ground ContentItem's child is created
 * a ComponentItem itemConfig will create a Stack with a child ComponentItem.
 * @public
 */
export type ResolvedRootItemConfig =
  | ResolvedRowOrColumnItemConfig
  | ResolvedStackItemConfig
  | ResolvedComponentItemConfig;

/** @internal */
export function createResolvedRootItemConfigCopy(
  config: ResolvedRootItemConfig,
): ResolvedRootItemConfig {
  return createResolvedItemConfigCopy(config) as ResolvedRootItemConfig;
}

/** @public */
export function isResolvedRootItemConfig(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedRootItemConfig {
  switch (itemConfig.type) {
    case ItemType.row:
    case ItemType.column:
    case ItemType.stack:
    case ItemType.component:
      return true;
    case ItemType.ground:
      return false;
    default:
      throw new UnreachableCaseError('CROCOSPCICIC13687', itemConfig.type);
  }
}
/** @public */
export interface ResolvedGroundItemConfig extends ResolvedItemConfig {
  readonly type: 'ground';
  readonly size: 100;
  readonly sizeUnit: typeof SizeUnit.Percent;
  readonly minSize: 0;
  readonly minSizeUnit: typeof SizeUnit.Pixel;
  readonly id: '';
  readonly isClosable: false;
  readonly title: '';
  readonly reorderEnabled: false;
}

/** @internal */
export function createResolvedGroundItemConfig(
  rootItemConfig: ResolvedRootItemConfig | undefined,
): ResolvedGroundItemConfig {
  const content = rootItemConfig === undefined ? [] : [rootItemConfig];
  return {
    type: ItemType.ground,
    content,
    size: 100,
    sizeUnit: SizeUnit.Percent,
    minSize: 0,
    minSizeUnit: SizeUnit.Pixel,
    id: '',
    isClosable: false,
    title: '',
    reorderEnabled: false,
  };
}

/** @public */
export interface ResolvedLayoutConfig {
  readonly root: ResolvedRootItemConfig | undefined;
  readonly openPopouts: ResolvedPopoutLayoutConfig[];
  readonly dimensions: ResolvedLayoutConfigDimensions;
  readonly settings: ResolvedLayoutConfigSettings;
  readonly header: ResolvedLayoutConfigHeader;
  readonly resolved: true;
}

/** @public */
export interface ResolvedLayoutConfigSettings {
  // See LayoutConfigSettings for comments.
  readonly constrainDragToContainer: boolean;
  readonly reorderEnabled: boolean; // also in ResolvedItemConfig which takes precedence
  readonly popoutWholeStack: boolean;
  readonly blockedPopoutsThrowError: boolean;
  readonly closePopoutsOnUnload: boolean;
  readonly responsiveMode: ResponsiveMode;
  readonly tabOverlapAllowance: number;
  readonly reorderOnTabMenuClick: boolean;
  readonly tabControlOffset: number;
  readonly popInOnClose: boolean;
}

/** @public */
export interface ResolvedLayoutConfigDimensions {
  // See LayoutConfigDimensions for comments.
  readonly borderWidth: number;
  readonly borderGrabWidth: number;
  readonly defaultMinItemHeight: number;
  readonly defaultMinItemHeightUnit: SizeUnit;
  readonly defaultMinItemWidth: number;
  readonly defaultMinItemWidthUnit: SizeUnit;
  readonly headerHeight: number;
  readonly dragProxyWidth: number;
  readonly dragProxyHeight: number;
}

/** @public */
export interface ResolvedLayoutConfigHeader {
  readonly show: false | Side;
  readonly popout: false | string;
  readonly dock: string;
  readonly maximise: false | string;
  readonly minimise: string;
  readonly close: false | string;
  readonly tabDropdown: false | string;
}

/** @public */
export const resolvedLayoutConfigSettingsDefaults = {
  constrainDragToContainer: true,
  reorderEnabled: true,
  popoutWholeStack: false,
  blockedPopoutsThrowError: true,
  closePopoutsOnUnload: true,
  responsiveMode: ResponsiveMode.none,
  tabOverlapAllowance: 0,
  reorderOnTabMenuClick: true,
  tabControlOffset: 10,
  popInOnClose: false,
} as const satisfies ResolvedLayoutConfigSettings;

/** @public */
export function createResolvedLayoutConfigSettingsCopy(
  original: ResolvedLayoutConfigSettings,
): ResolvedLayoutConfigSettings {
  return {
    constrainDragToContainer: original.constrainDragToContainer,
    reorderEnabled: original.reorderEnabled,
    popoutWholeStack: original.popoutWholeStack,
    blockedPopoutsThrowError: original.blockedPopoutsThrowError,
    closePopoutsOnUnload: original.closePopoutsOnUnload,
    responsiveMode: original.responsiveMode,
    tabOverlapAllowance: original.tabOverlapAllowance,
    reorderOnTabMenuClick: original.reorderOnTabMenuClick,
    tabControlOffset: original.tabControlOffset,
    popInOnClose: original.popInOnClose,
  };
}

/** @public */
export const resolvedLayoutConfigDimensionsDefaults = {
  borderWidth: 5,
  borderGrabWidth: 5,
  defaultMinItemHeight: 0,
  defaultMinItemHeightUnit: SizeUnit.Pixel,
  defaultMinItemWidth: 10,
  defaultMinItemWidthUnit: SizeUnit.Pixel,
  headerHeight: 20,
  dragProxyWidth: 300,
  dragProxyHeight: 200,
} as const satisfies ResolvedLayoutConfigDimensions;

/** @public */
export function createResolvedLayoutConfigDimensionsCopy(
  original: ResolvedLayoutConfigDimensions,
): ResolvedLayoutConfigDimensions {
  return {
    borderWidth: original.borderWidth,
    borderGrabWidth: original.borderGrabWidth,
    defaultMinItemHeight: original.defaultMinItemHeight,
    defaultMinItemHeightUnit: original.defaultMinItemHeightUnit,
    defaultMinItemWidth: original.defaultMinItemWidth,
    defaultMinItemWidthUnit: original.defaultMinItemWidthUnit,
    headerHeight: original.headerHeight,
    dragProxyWidth: original.dragProxyWidth,
    dragProxyHeight: original.dragProxyHeight,
  };
}

/** @public */
export const resolvedLayoutConfigHeaderDefaults = {
  show: Side.top,
  popout: 'open in new window',
  dock: 'dock',
  maximise: 'maximise',
  minimise: 'minimise',
  close: 'close',
  tabDropdown: 'additional tabs',
} as const satisfies ResolvedLayoutConfigHeader;

/** @public */
export function createResolvedLayoutConfigHeaderCopy(
  original: ResolvedLayoutConfigHeader,
): ResolvedLayoutConfigHeader {
  return {
    show: original.show,
    popout: original.popout,
    dock: original.dock,
    close: original.close,
    maximise: original.maximise,
    minimise: original.minimise,
    tabDropdown: original.tabDropdown,
  };
}

/** @public */
export function isResolvedPopoutLayoutConfig(
  config: ResolvedLayoutConfig,
): config is ResolvedPopoutLayoutConfig {
  return 'parentId' in config;
}

/** @public */
export function createResolvedLayoutConfigDefault(): ResolvedLayoutConfig {
  const result: ResolvedLayoutConfig = {
    root: undefined,
    openPopouts: [],
    dimensions: resolvedLayoutConfigDimensionsDefaults,
    settings: resolvedLayoutConfigSettingsDefaults,
    header: resolvedLayoutConfigHeaderDefaults,
    resolved: true,
  };
  return result;
}

/** @public */
export function createResolvedLayoutConfigCopy(
  config: ResolvedLayoutConfig,
): ResolvedLayoutConfig {
  if (isResolvedPopoutLayoutConfig(config)) {
    return createResolvedPopoutLayoutConfigCopy(config);
  } else {
    const result: ResolvedLayoutConfig = {
      root:
        config.root === undefined
          ? undefined
          : createResolvedRootItemConfigCopy(config.root),
      openPopouts: createResolvedOpenPopoutsCopy(config.openPopouts),
      settings: createResolvedLayoutConfigSettingsCopy(config.settings),
      dimensions: createResolvedLayoutConfigDimensionsCopy(config.dimensions),
      header: createResolvedLayoutConfigHeaderCopy(config.header),
      resolved: config.resolved,
    };
    return result;
  }
}

/** @public */
export function createResolvedOpenPopoutsCopy(
  original: ResolvedPopoutLayoutConfig[],
): ResolvedPopoutLayoutConfig[] {
  const count = original.length;
  const result = Array<ResolvedPopoutLayoutConfig>(count);
  for (let i = 0; i < count; i++) {
    result[i] = createResolvedPopoutLayoutConfigCopy(original[i]);
  }
  return result;
}

/**
 * Takes a StrelitLayout configuration object and
 * replaces its keys and values recursively with
 * one letter counterparts
 * @public
 */
export function minifyResolvedLayoutConfig(
  layoutConfig: ResolvedLayoutConfig,
): ResolvedLayoutConfig {
  return translateMinifiedConfigObject(
    layoutConfig as unknown as Record<string, unknown>,
    true,
  ) as unknown as ResolvedLayoutConfig;
}

/**
 * Takes a configuration Object that was previously minified
 * using minifyConfig and returns its original version
 * @public
 */
export function unminifyResolvedLayoutConfig(
  minifiedConfig: ResolvedLayoutConfig,
): ResolvedLayoutConfig {
  return translateMinifiedConfigObject(
    minifiedConfig as unknown as Record<string, unknown>,
    false,
  ) as unknown as ResolvedLayoutConfig;
}

/** @public */
export interface ResolvedPopoutLayoutConfig extends ResolvedLayoutConfig {
  readonly parentId: string | null;
  readonly indexInParent: number | null;
  readonly window: ResolvedPopoutLayoutConfigWindow;
}

/** @public */
export interface ResolvedPopoutLayoutConfigWindow {
  readonly width: number | null;
  readonly height: number | null;
  readonly left: number | null;
  readonly top: number | null;
}

/** @public */
export const resolvedPopoutLayoutConfigWindowDefaults = {
  width: null,
  height: null,
  left: null,
  top: null,
} as const satisfies ResolvedPopoutLayoutConfigWindow;

/** @public */
export function createResolvedPopoutLayoutConfigWindowCopy(
  original: ResolvedPopoutLayoutConfigWindow,
): ResolvedPopoutLayoutConfigWindow {
  return {
    width: original.width,
    height: original.height,
    left: original.left,
    top: original.top,
  };
}

/** @public */
export function createResolvedPopoutLayoutConfigCopy(
  original: ResolvedPopoutLayoutConfig,
): ResolvedPopoutLayoutConfig {
  const result: ResolvedPopoutLayoutConfig = {
    root:
      original.root === undefined
        ? undefined
        : createResolvedRootItemConfigCopy(original.root),
    openPopouts: createResolvedOpenPopoutsCopy(original.openPopouts),
    settings: createResolvedLayoutConfigSettingsCopy(original.settings),
    dimensions: createResolvedLayoutConfigDimensionsCopy(original.dimensions),
    header: createResolvedLayoutConfigHeaderCopy(original.header),
    parentId: original.parentId,
    indexInParent: original.indexInParent,
    window: createResolvedPopoutLayoutConfigWindowCopy(original.window),
    resolved: original.resolved,
  };
  return result;
}
