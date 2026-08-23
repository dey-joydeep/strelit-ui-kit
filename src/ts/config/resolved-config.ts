import { ConfigurationError } from '../errors/external-error';
import { AssertError, UnreachableCaseError } from '../errors/internal-error';
import { translateObject as translateMinifiedConfigObject } from '../utils/config-minifier';
import {
  maximumConfigDepth,
  maximumConfigNodes,
} from '../utils/resource-limits';
import {
  ComponentType,
  ItemType,
  ResponsiveMode,
  SerializableValue,
  Side,
  SizeUnit,
} from '../utils/types';
import { deepCloneValue } from '../utils/utils';

/**
 * Defines the resolved item config contract.
 * @public
 */
export interface ResolvedItemConfig {
  // see ItemConfig for comments
  /** The type. */
  readonly type: ItemType;
  /** The content. */
  readonly content: readonly ResolvedItemConfig[];
  /** The size. */
  readonly size: number;
  /** The size unit. */
  readonly sizeUnit: SizeUnit;
  /** The min size. */
  readonly minSize: number | undefined;
  /** The min size unit. */
  readonly minSizeUnit: SizeUnit;
  // id no longer specifies whether an Item is maximised.  This is now done by HeaderItemConfig.maximised
  /** The id. */
  readonly id: string;
  /** Whether closable. */
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

/**
 * Creates resolved item config default.
 * @public
 */
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

/**
 * Returns whether resolved component item config.
 * @public
 */
export function isResolvedComponentItemConfig(
  itemConfig: ResolvedItemConfig,
): itemConfig is ResolvedComponentItemConfig {
  return itemConfig.type === ItemType.component;
}

/**
 * Returns whether resolved stack item config.
 * @public
 */
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
/**
 * Defines the resolved headered item config contract.
 * @public
 */
export interface ResolvedHeaderedItemConfig extends ResolvedItemConfig {
  /** The header. */
  header: ResolvedHeaderedItemConfigHeader | undefined; // undefined means get header settings from LayoutConfig
  /** The maximised. */
  readonly maximised: boolean;
}

/**
 * Provides the resolved headered item config default maximised.
 * @public
 */
export const resolvedHeaderedItemConfigDefaultMaximised = false;

/**
 * Defines the resolved headered item config header contract.
 * @public
 */
export interface ResolvedHeaderedItemConfigHeader {
  // undefined means get property value from LayoutConfig
  /** The show. */
  readonly show: false | Side | undefined;
  /** The popout. */
  readonly popout: false | string | undefined;
  /** The dock. */
  readonly dock: false | string | undefined;
  /** The maximise. */
  readonly maximise: false | string | undefined;
  /** The close. */
  readonly close: string | undefined;
  /** The minimise. */
  readonly minimise: string | undefined;
  /** The tab dropdown. */
  readonly tabDropdown: false | string | undefined;
}

/**
 * Creates resolved headered item config header copy.
 * @public
 */
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
      dock: original.dock,
      close: original.close,
      maximise: original.maximise,
      minimise: original.minimise,
      tabDropdown: original.tabDropdown,
    };
  }
}

/**
 * Defines the resolved stack item config contract.
 * @public
 */
export interface ResolvedStackItemConfig extends ResolvedHeaderedItemConfig {
  /** The type. */
  readonly type: 'stack';
  /** The content. */
  readonly content: ResolvedComponentItemConfig[];
  /** The index of the active item in the Stack.  Only undefined if the Stack is empty. */
  readonly activeItemIndex: number | undefined;
}

/**
 * Provides the resolved stack item config default active item index.
 * @public
 */
export const resolvedStackItemConfigDefaultActiveItemIndex = 0;

/**
 * Creates resolved stack item config copy.
 * @public
 */
export function createResolvedStackItemConfigCopy(
  original: ResolvedStackItemConfig,
  content?: ResolvedComponentItemConfig[],
): ResolvedStackItemConfig {
  const copiedContent =
    content !== undefined
      ? createResolvedStackItemConfigContentCopy(content)
      : createResolvedStackItemConfigContentCopy(original.content);
  const activeItemIndex =
    content === undefined
      ? original.activeItemIndex
      : copiedContent.length === 0
        ? undefined
        : original.activeItemIndex !== undefined &&
            original.activeItemIndex >= 0 &&
            original.activeItemIndex < copiedContent.length
          ? original.activeItemIndex
          : 0;
  const result: ResolvedStackItemConfig = {
    type: original.type,
    content: copiedContent,
    size: original.size,
    sizeUnit: original.sizeUnit,
    minSize: original.minSize,
    minSizeUnit: original.minSizeUnit,
    id: original.id,
    maximised: original.maximised,
    isClosable: original.isClosable,
    activeItemIndex,
    header: createResolvedHeaderedItemConfigHeaderCopy(original.header),
  };
  return result;
}

/**
 * Creates resolved stack item config content copy.
 * @public
 */
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

/**
 * Creates resolved stack item config default.
 * @public
 */
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
    activeItemIndex: undefined,
    header: undefined,
  };
  return result;
}

/**
 * Defines the resolved component item config contract.
 * @public
 */
export interface ResolvedComponentItemConfig extends ResolvedHeaderedItemConfig {
  // see ComponentItemConfig for comments
  /** The type. */
  readonly type: 'component';
  /** The content. */
  readonly content: [];
  /** The title. */
  readonly title: string;
  /** The reorder enabled. */
  readonly reorderEnabled: boolean; // Takes precedence over LayoutConfig.reorderEnabled.
  /**
   * The name of the component as specified in layout.registerComponent. Mandatory if type is 'component'.
   */
  readonly componentType: ComponentType;
  /** The component state. */
  readonly componentState?: SerializableValue;
}

/**
 * Provides the resolved component item config default reorder enabled.
 * @public
 */
export const resolvedComponentItemConfigDefaultReorderEnabled = true;

/**
 * Resolves component type name.
 * @public
 */
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

/**
 * Creates resolved component item config copy.
 * @public
 */
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
    componentType: createComponentTypeCopy(original.componentType),
    componentState: deepCloneValue(
      original.componentState,
    ) as SerializableValue,
  };
  return result;
}

/**
 * Creates resolved component item config default.
 * @public
 */
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

/**
 * Creates component type copy.
 * @public
 */
export function createComponentTypeCopy(
  componentType: ComponentType,
): ComponentType {
  return deepCloneValue(componentType) as ComponentType;
}

/** Base for Root or RowOrColumn ItemConfigs
 * @public
 */
export interface ResolvedRowOrColumnItemConfig extends ResolvedItemConfig {
  /** The type. */
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

/**
 * Represents resolved row or column item config child item config.
 * @public
 */
export type ResolvedRowOrColumnItemConfigChildItemConfig =
  | ResolvedRowOrColumnItemConfig
  | ResolvedStackItemConfig
  | ResolvedComponentItemConfig;

/**
 * Returns whether resolved row or column item config child.
 * @public
 */
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

/**
 * Creates resolved row or column item config copy.
 * @public
 */
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

/**
 * Creates resolved row or column item config content copy.
 * @public
 */
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

/**
 * Creates resolved row or column item config default.
 * @public
 */
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

/**
 * Returns whether resolved root item config.
 * @public
 */
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
/**
 * Defines the resolved ground item config contract.
 * @public
 */
export interface ResolvedGroundItemConfig extends ResolvedItemConfig {
  /** The type. */
  readonly type: 'ground';
  /** The size. */
  readonly size: 100;
  /** The size unit. */
  readonly sizeUnit: typeof SizeUnit.Percent;
  /** The min size. */
  readonly minSize: 0;
  /** The min size unit. */
  readonly minSizeUnit: typeof SizeUnit.Pixel;
  /** The id. */
  readonly id: '';
  /** Whether closable. */
  readonly isClosable: false;
  /** The title. */
  readonly title: '';
  /** The reorder enabled. */
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

/**
 * Defines the resolved layout config contract.
 * @public
 */
export interface ResolvedLayoutConfig {
  /** The root. */
  readonly root: ResolvedRootItemConfig | undefined;
  /** The open popouts. */
  readonly openPopouts: ResolvedPopoutLayoutConfig[];
  /** The dimensions. */
  readonly dimensions: ResolvedLayoutConfigDimensions;
  /** The settings. */
  readonly settings: ResolvedLayoutConfigSettings;
  /** The header. */
  readonly header: ResolvedLayoutConfigHeader;
  /** The resolved. */
  readonly resolved: true;
}

/**
 * Defines the resolved layout config settings contract.
 * @public
 */
export interface ResolvedLayoutConfigSettings {
  // See LayoutConfigSettings for comments.
  /** The constrain drag to container. */
  readonly constrainDragToContainer: boolean;
  /** The reorder enabled. */
  readonly reorderEnabled: boolean; // also in ResolvedItemConfig which takes precedence
  /** The popout whole stack. */
  readonly popoutWholeStack: boolean;
  /** The blocked popouts throw error. */
  readonly blockedPopoutsThrowError: boolean;
  /** The close popouts on unload. */
  readonly closePopoutsOnUnload: boolean;
  /** The responsive mode. */
  readonly responsiveMode: ResponsiveMode;
  /** The tab overlap allowance. */
  readonly tabOverlapAllowance: number;
  /** The reorder on tab menu click. */
  readonly reorderOnTabMenuClick: boolean;
  /** The tab control offset. */
  readonly tabControlOffset: number;
  /** The pop in on close. */
  readonly popInOnClose: boolean;
}

/**
 * Defines the resolved layout config dimensions contract.
 * @public
 */
export interface ResolvedLayoutConfigDimensions {
  // See LayoutConfigDimensions for comments.
  /** The border width. */
  readonly borderWidth: number;
  /** The border grab width. */
  readonly borderGrabWidth: number;
  /** The default min item height. */
  readonly defaultMinItemHeight: number;
  /** The default min item height unit. */
  readonly defaultMinItemHeightUnit: SizeUnit;
  /** The default min item width. */
  readonly defaultMinItemWidth: number;
  /** The default min item width unit. */
  readonly defaultMinItemWidthUnit: SizeUnit;
  /** The header height. */
  readonly headerHeight: number;
  /** The drag proxy width. */
  readonly dragProxyWidth: number;
  /** The drag proxy height. */
  readonly dragProxyHeight: number;
}

/**
 * Defines the resolved layout config header contract.
 * @public
 */
export interface ResolvedLayoutConfigHeader {
  /** The show. */
  readonly show: false | Side;
  /** The popout. */
  readonly popout: false | string;
  /** The dock. */
  readonly dock: string;
  /** The maximise. */
  readonly maximise: false | string;
  /** The minimise. */
  readonly minimise: string;
  /** The close. */
  readonly close: false | string;
  /** The tab dropdown. */
  readonly tabDropdown: false | string;
}

/**
 * Provides the resolved layout config settings defaults.
 * @public
 */
export const resolvedLayoutConfigSettingsDefaults = {
  /** The constrain drag to container. */
  constrainDragToContainer: true,
  /** The reorder enabled. */
  reorderEnabled: true,
  /** The popout whole stack. */
  popoutWholeStack: false,
  /** The blocked popouts throw error. */
  blockedPopoutsThrowError: true,
  /** The close popouts on unload. */
  closePopoutsOnUnload: true,
  /** The responsive mode. */
  responsiveMode: ResponsiveMode.none,
  /** The tab overlap allowance. */
  tabOverlapAllowance: 0,
  /** The reorder on tab menu click. */
  reorderOnTabMenuClick: true,
  /** The tab control offset. */
  tabControlOffset: 10,
  /** The pop in on close. */
  popInOnClose: false,
} as const satisfies ResolvedLayoutConfigSettings;

/**
 * Creates resolved layout config settings copy.
 * @public
 */
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

/**
 * Provides the resolved layout config dimensions defaults.
 * @public
 */
export const resolvedLayoutConfigDimensionsDefaults = {
  /** The border width. */
  borderWidth: 5,
  /** The border grab width. */
  borderGrabWidth: 5,
  /** The default min item height. */
  defaultMinItemHeight: 0,
  /** The default min item height unit. */
  defaultMinItemHeightUnit: SizeUnit.Pixel,
  /** The default min item width. */
  defaultMinItemWidth: 10,
  /** The default min item width unit. */
  defaultMinItemWidthUnit: SizeUnit.Pixel,
  /** The header height. */
  headerHeight: 20,
  /** The drag proxy width. */
  dragProxyWidth: 300,
  /** The drag proxy height. */
  dragProxyHeight: 200,
} as const satisfies ResolvedLayoutConfigDimensions;

/**
 * Creates resolved layout config dimensions copy.
 * @public
 */
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

/**
 * Provides the resolved layout config header defaults.
 * @public
 */
export const resolvedLayoutConfigHeaderDefaults = {
  /** The show. */
  show: Side.top,
  /** The popout. */
  popout: 'open in new window',
  /** The dock. */
  dock: 'dock',
  /** The maximise. */
  maximise: 'maximise',
  /** The minimise. */
  minimise: 'minimise',
  /** The close. */
  close: 'close',
  /** The tab dropdown. */
  tabDropdown: 'additional tabs',
} as const satisfies ResolvedLayoutConfigHeader;

/**
 * Creates resolved layout config header copy.
 * @public
 */
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

/**
 * Returns whether resolved popout layout config.
 * @public
 */
export function isResolvedPopoutLayoutConfig(
  config: ResolvedLayoutConfig,
): config is ResolvedPopoutLayoutConfig {
  return 'parentId' in config;
}

/**
 * Creates resolved layout config default.
 * @public
 */
export function createResolvedLayoutConfigDefault(): ResolvedLayoutConfig {
  const result: ResolvedLayoutConfig = {
    root: undefined,
    openPopouts: [],
    dimensions: createResolvedLayoutConfigDimensionsCopy(
      resolvedLayoutConfigDimensionsDefaults,
    ),
    settings: createResolvedLayoutConfigSettingsCopy(
      resolvedLayoutConfigSettingsDefaults,
    ),
    header: createResolvedLayoutConfigHeaderCopy(
      resolvedLayoutConfigHeaderDefaults,
    ),
    resolved: true,
  };
  return result;
}

/**
 * Creates resolved layout config copy.
 * @public
 */
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

/**
 * Creates resolved open popouts copy.
 * @public
 */
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
 * Represents a minified layout configuration object where property names
 * and values are shortened to single-letter or compact counterparts.
 * @public
 */
export type MinifiedLayoutConfig = Record<string, unknown>;

function assertRecord(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigurationError(`${name} must be an object`);
  }
}

function assertResolvedLayoutConfigStructure(value: unknown): void {
  type Frame =
    | {
        readonly kind: 'layout';
        readonly value: unknown;
        readonly popoutDepth: number;
      }
    | {
        readonly kind: 'item';
        readonly value: unknown;
        readonly itemDepth: number;
      };

  const stack: Frame[] = [{ kind: 'layout', value, popoutDepth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    nodes++;
    const depth = frame.kind === 'layout' ? frame.popoutDepth : frame.itemDepth;
    if (depth > maximumConfigDepth || nodes > maximumConfigNodes) {
      throw new ConfigurationError(
        'Unminified layout configuration exceeds resource limits',
      );
    }
    assertRecord(frame.value, `Unminified ${frame.kind} configuration`);

    if (frame.kind === 'layout') {
      if (frame.value.resolved !== true) {
        throw new ConfigurationError(
          'Unminified layout configuration must be resolved',
        );
      }
      if (!Array.isArray(frame.value.openPopouts)) {
        throw new ConfigurationError(
          'Unminified layout configuration openPopouts must be an array',
        );
      }
      assertRecord(
        frame.value.settings,
        'Unminified layout configuration settings',
      );
      assertRecord(
        frame.value.dimensions,
        'Unminified layout configuration dimensions',
      );
      assertRecord(
        frame.value.header,
        'Unminified layout configuration header',
      );
      if (frame.value.root !== undefined) {
        stack.push({ kind: 'item', value: frame.value.root, itemDepth: 0 });
      }
      for (
        let index = frame.value.openPopouts.length - 1;
        index >= 0;
        index--
      ) {
        stack.push({
          kind: 'layout',
          value: frame.value.openPopouts[index],
          popoutDepth: frame.popoutDepth + 1,
        });
      }
    } else {
      if (
        frame.value.type !== ItemType.row &&
        frame.value.type !== ItemType.column &&
        frame.value.type !== ItemType.stack &&
        frame.value.type !== ItemType.component
      ) {
        throw new ConfigurationError(
          'Unminified layout item configuration has an invalid type',
        );
      }
      if (!Array.isArray(frame.value.content)) {
        throw new ConfigurationError(
          'Unminified layout item configuration content must be an array',
        );
      }
      if (
        frame.value.type === ItemType.component &&
        !Object.prototype.hasOwnProperty.call(frame.value, 'componentType')
      ) {
        throw new ConfigurationError(
          'Unminified component configuration requires componentType',
        );
      }
      for (let index = frame.value.content.length - 1; index >= 0; index--) {
        stack.push({
          kind: 'item',
          value: frame.value.content[index],
          itemDepth: frame.itemDepth + 1,
        });
      }
    }
  }
}

/**
 * Takes a StrelitLayout configuration object and
 * replaces its keys and values recursively with
 * one letter counterparts
 * @public
 */
export function minifyResolvedLayoutConfig(
  layoutConfig: ResolvedLayoutConfig,
): MinifiedLayoutConfig {
  return translateMinifiedConfigObject(
    layoutConfig as unknown as Record<string, unknown>,
    true,
  ) as MinifiedLayoutConfig;
}

/**
 * Takes a configuration Object that was previously minified
 * using minifyConfig and returns its original version
 * @public
 */
export function unminifyResolvedLayoutConfig(
  minifiedConfig: MinifiedLayoutConfig,
): ResolvedLayoutConfig {
  const unminified = translateMinifiedConfigObject(
    minifiedConfig as unknown as Record<string, unknown>,
    false,
  );
  assertResolvedLayoutConfigStructure(unminified);
  return unminified as unknown as ResolvedLayoutConfig;
}

/**
 * Defines the resolved popout layout config contract.
 * @public
 */
export interface ResolvedPopoutLayoutConfig extends ResolvedLayoutConfig {
  /** The parent id. */
  readonly parentId: string | null;
  /** The index in parent. */
  readonly indexInParent: number | null;
  /** The window. */
  readonly window: ResolvedPopoutLayoutConfigWindow;
}

/**
 * Defines the resolved popout layout config window contract.
 * @public
 */
export interface ResolvedPopoutLayoutConfigWindow {
  /** The width. */
  readonly width: number | null;
  /** The height. */
  readonly height: number | null;
  /** The left. */
  readonly left: number | null;
  /** The top. */
  readonly top: number | null;
}

/**
 * Provides the resolved popout layout config window defaults.
 * @public
 */
export const resolvedPopoutLayoutConfigWindowDefaults = {
  /** The width. */
  width: null,
  /** The height. */
  height: null,
  /** The left. */
  left: null,
  /** The top. */
  top: null,
} as const satisfies ResolvedPopoutLayoutConfigWindow;

/**
 * Creates resolved popout layout config window copy.
 * @public
 */
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

/**
 * Creates resolved popout layout config copy.
 * @public
 */
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
