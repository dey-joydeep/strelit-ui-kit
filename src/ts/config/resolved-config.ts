import { AssertError, UnreachableCaseError } from '../errors/internal-error';
import { translateObject as translateMinifiedConfigObject } from '../utils/config-minifier';
import {
  ComponentType,
  ItemType,
  ResponsiveMode,
  SerializableValue,
  Side,
  SizeUnitEnum,
} from '../utils/types';
import { deepExtendValue } from '../utils/utils';

/** @public */
export interface ResolvedItemConfig {
  // see ItemConfig for comments
  readonly type: ItemType;
  readonly content: readonly ResolvedItemConfig[];
  readonly size: number;
  readonly sizeUnit: SizeUnitEnum;
  readonly minSize: number | undefined;
  readonly minSizeUnit: SizeUnitEnum;
  // id no longer specifies whether an Item is maximised.  This is now done by HeaderItemConfig.maximised
  readonly id: string;
  readonly isClosable: boolean;
}

/** @internal */
export const resolvedItemConfigDefaults: ResolvedItemConfig = {
  type: ItemType.ground, // not really default but need something
  content: [],
  size: 1,
  sizeUnit: SizeUnitEnum.Fractional,
  minSize: undefined,
  minSizeUnit: SizeUnitEnum.Pixel,
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
      return ResolvedRowOrColumnItemConfig.createCopy(
        original as ResolvedRowOrColumnItemConfig,
        content as ResolvedRowOrColumnItemConfigChildItemConfig[],
      );

    case ItemType.stack:
      return ResolvedStackItemConfig.createCopy(
        original as ResolvedStackItemConfig,
        content as ResolvedComponentItemConfig[],
      );

    case ItemType.component:
      return ResolvedComponentItemConfig.createCopy(
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
      return ResolvedRowOrColumnItemConfig.createDefault(type);

    case ItemType.stack:
      return ResolvedStackItemConfig.createDefault();

    case ItemType.component:
      return ResolvedComponentItemConfig.createDefault();

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
export const ResolvedStackItemConfig = {
  defaultActiveItemIndex: 0,

  createCopy(
    original: ResolvedStackItemConfig,
    content?: ResolvedComponentItemConfig[],
  ): ResolvedStackItemConfig {
    const result: ResolvedStackItemConfig = {
      type: original.type,
      content:
        content !== undefined
          ? this.copyContent(content)
          : this.copyContent(original.content),
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
  },

  copyContent(
    original: ResolvedComponentItemConfig[],
  ): ResolvedComponentItemConfig[] {
    const count = original.length;
    const result = new Array<ResolvedComponentItemConfig>(count);
    for (let i = 0; i < count; i++) {
      result[i] = createResolvedItemConfigCopy(
        original[i],
      ) as ResolvedComponentItemConfig;
    }
    return result;
  },

  createDefault(): ResolvedStackItemConfig {
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
      activeItemIndex: this.defaultActiveItemIndex,
      header: undefined,
    };
    return result;
  },
} as const;

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
export const ResolvedComponentItemConfig = {
  defaultReorderEnabled: true,

  resolveComponentTypeName(
    itemConfig: ResolvedComponentItemConfig,
  ): string | undefined {
    const componentType = itemConfig.componentType;
    if (typeof componentType === 'string') {
      return componentType;
    } else {
      return undefined;
    }
  },

  createCopy(
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
      componentState: deepExtendValue(
        undefined,
        original.componentState,
      ) as SerializableValue,
    };
    return result;
  },

  createDefault(
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
      reorderEnabled: this.defaultReorderEnabled,
      title,
      header: undefined,
      componentType,
      componentState,
    };
    return result;
  },

  copyComponentType(componentType: ComponentType): ComponentType {
    return deepExtendValue({}, componentType) as ComponentType;
  },
} as const;

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
export const ResolvedRowOrColumnItemConfig = {
  isChildItemConfig(
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
  },

  createCopy(
    original: ResolvedRowOrColumnItemConfig,
    content?: ResolvedRowOrColumnItemConfigChildItemConfig[],
  ): ResolvedRowOrColumnItemConfig {
    const result: ResolvedRowOrColumnItemConfig = {
      type: original.type,
      content:
        content !== undefined
          ? this.copyContent(content)
          : this.copyContent(original.content),
      size: original.size,
      sizeUnit: original.sizeUnit,
      minSize: original.minSize,
      minSizeUnit: original.minSizeUnit,
      id: original.id,
      isClosable: original.isClosable,
    };
    return result;
  },

  copyContent(
    original: readonly ResolvedRowOrColumnItemConfigChildItemConfig[],
  ): ResolvedRowOrColumnItemConfigChildItemConfig[] {
    const count = original.length;
    const result = new Array<ResolvedRowOrColumnItemConfigChildItemConfig>(
      count,
    );
    for (let i = 0; i < count; i++) {
      result[i] = createResolvedItemConfigCopy(
        original[i],
      ) as ResolvedRowOrColumnItemConfigChildItemConfig;
    }
    return result;
  },

  createDefault(type: 'row' | 'column'): ResolvedRowOrColumnItemConfig {
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
  },
} as const;

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
  readonly sizeUnit: typeof SizeUnitEnum.Percent;
  readonly minSize: 0;
  readonly minSizeUnit: typeof SizeUnitEnum.Pixel;
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
    sizeUnit: SizeUnitEnum.Percent,
    minSize: 0,
    minSizeUnit: SizeUnitEnum.Pixel,
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
  // see Config.Settings for comments
  readonly constrainDragToContainer: boolean;
  readonly reorderEnabled: boolean; // also in ResolvedItemConfig which takes precedence
  readonly popoutWholeStack: boolean;
  readonly blockedPopoutsThrowError: boolean;
  /** @deprecated Will be removed in version 3. */
  readonly closePopoutsOnUnload: boolean;
  readonly responsiveMode: ResponsiveMode;
  readonly tabOverlapAllowance: number;
  readonly reorderOnTabMenuClick: boolean;
  readonly tabControlOffset: number;
  readonly popInOnClose: boolean;
}

/** @public */
export interface ResolvedLayoutConfigDimensions {
  // see LayoutConfig.Dimensions for comments
  readonly borderWidth: number;
  readonly borderGrabWidth: number;
  readonly defaultMinItemHeight: number;
  readonly defaultMinItemHeightUnit: SizeUnitEnum;
  readonly defaultMinItemWidth: number;
  readonly defaultMinItemWidthUnit: SizeUnitEnum;
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
export const ResolvedLayoutConfig = {
  Settings: {
    defaults: {
      constrainDragToContainer: true,
      reorderEnabled: true,
      popoutWholeStack: false,
      blockedPopoutsThrowError: true,
      closePopoutsOnUnload: true,
      responsiveMode: ResponsiveMode.none, // was onload
      tabOverlapAllowance: 0,
      reorderOnTabMenuClick: true,
      tabControlOffset: 10,
      popInOnClose: false,
    } as const satisfies ResolvedLayoutConfigSettings,

    createCopy(
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
    },
  },
  Dimensions: {
    createCopy(
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
    },

    defaults: {
      borderWidth: 5,
      borderGrabWidth: 5,
      defaultMinItemHeight: 0,
      defaultMinItemHeightUnit: SizeUnitEnum.Pixel,
      defaultMinItemWidth: 10,
      defaultMinItemWidthUnit: SizeUnitEnum.Pixel,
      headerHeight: 20,
      dragProxyWidth: 300,
      dragProxyHeight: 200,
    } as const satisfies ResolvedLayoutConfigDimensions,
  },
  Header: {
    createCopy(
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
    },

    defaults: {
      show: Side.top,
      popout: 'open in new window',
      dock: 'dock',
      maximise: 'maximise',
      minimise: 'minimise',
      close: 'close',
      tabDropdown: 'additional tabs',
    } as const satisfies ResolvedLayoutConfigHeader,
  },
  isPopout(config: ResolvedLayoutConfig): config is ResolvedPopoutLayoutConfig {
    return 'parentId' in config;
  },

  createDefault(): ResolvedLayoutConfig {
    const result: ResolvedLayoutConfig = {
      root: undefined,
      openPopouts: [],
      dimensions: ResolvedLayoutConfig.Dimensions.defaults,
      settings: ResolvedLayoutConfig.Settings.defaults,
      header: ResolvedLayoutConfig.Header.defaults,
      resolved: true,
    };
    return result;
  },

  createCopy(config: ResolvedLayoutConfig): ResolvedLayoutConfig {
    if (this.isPopout(config)) {
      return ResolvedPopoutLayoutConfig.createCopy(config);
    } else {
      const result: ResolvedLayoutConfig = {
        root:
          config.root === undefined
            ? undefined
            : createResolvedRootItemConfigCopy(config.root),
        openPopouts: this.copyOpenPopouts(config.openPopouts),
        settings: ResolvedLayoutConfig.Settings.createCopy(config.settings),
        dimensions: ResolvedLayoutConfig.Dimensions.createCopy(
          config.dimensions,
        ),
        header: ResolvedLayoutConfig.Header.createCopy(config.header),
        resolved: config.resolved,
      };
      return result;
    }
  },

  copyOpenPopouts(
    original: ResolvedPopoutLayoutConfig[],
  ): ResolvedPopoutLayoutConfig[] {
    const count = original.length;
    const result = new Array<ResolvedPopoutLayoutConfig>(count);
    for (let i = 0; i < count; i++) {
      result[i] = ResolvedPopoutLayoutConfig.createCopy(original[i]);
    }
    return result;
  },

  /**
   * Takes a StrelitLayout configuration object and
   * replaces its keys and values recursively with
   * one letter counterparts
   */
  minifyConfig(layoutConfig: ResolvedLayoutConfig): ResolvedLayoutConfig {
    return translateMinifiedConfigObject(
      layoutConfig as unknown as Record<string, unknown>,
      true,
    ) as unknown as ResolvedLayoutConfig;
  },

  /**
   * Takes a configuration Object that was previously minified
   * using minifyConfig and returns its original version
   */
  unminifyConfig(minifiedConfig: ResolvedLayoutConfig): ResolvedLayoutConfig {
    return translateMinifiedConfigObject(
      minifiedConfig as unknown as Record<string, unknown>,
      false,
    ) as unknown as ResolvedLayoutConfig;
  },
} as const;

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
export const ResolvedPopoutLayoutConfig = {
  Window: {
    createCopy(
      original: ResolvedPopoutLayoutConfigWindow,
    ): ResolvedPopoutLayoutConfigWindow {
      return {
        width: original.width,
        height: original.height,
        left: original.left,
        top: original.top,
      };
    },

    defaults: {
      width: null,
      height: null,
      left: null,
      top: null,
    } as const satisfies ResolvedPopoutLayoutConfigWindow,
  },

  createCopy(original: ResolvedPopoutLayoutConfig): ResolvedPopoutLayoutConfig {
    const result: ResolvedPopoutLayoutConfig = {
      root:
        original.root === undefined
          ? undefined
          : createResolvedRootItemConfigCopy(original.root),
      openPopouts: ResolvedLayoutConfig.copyOpenPopouts(original.openPopouts),
      settings: ResolvedLayoutConfig.Settings.createCopy(original.settings),
      dimensions: ResolvedLayoutConfig.Dimensions.createCopy(
        original.dimensions,
      ),
      header: ResolvedLayoutConfig.Header.createCopy(original.header),
      parentId: original.parentId,
      indexInParent: original.indexInParent,
      window: ResolvedPopoutLayoutConfig.Window.createCopy(original.window),
      resolved: original.resolved,
    };
    return result;
  },
} as const;
