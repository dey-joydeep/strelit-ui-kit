import { ConfigurationError } from '../errors/external-error';
import { AssertError, UnreachableCaseError } from '../errors/internal-error';
import { I18nStringId, i18nStrings } from '../utils/i18n-strings';
import {
  ComponentType,
  ItemType,
  ResponsiveMode,
  SerializableValue,
  Side,
  SizeUnit,
  formatSizeUnit,
  tryParseSizeUnit,
} from '../utils/types';
import {
  deepCloneValue,
  splitStringAtFirstNonNumericChar,
} from '../utils/utils';
import {
  maximumConfigDepth,
  maximumConfigNodes,
} from '../utils/resource-limits';
import {
  createResolvedHeaderedItemConfigHeaderCopy,
  createResolvedLayoutConfigSettingsCopy,
  isResolvedComponentItemConfig,
  isResolvedRootItemConfig,
  isResolvedRowOrColumnItemConfigChild,
  resolvedComponentItemConfigDefaultReorderEnabled,
  resolvedItemConfigDefaults,
  resolvedLayoutConfigDimensionsDefaults,
  resolvedLayoutConfigHeaderDefaults,
  resolvedLayoutConfigSettingsDefaults,
  resolvedPopoutLayoutConfigWindowDefaults,
  resolvedStackItemConfigDefaultActiveItemIndex,
  type ResolvedComponentItemConfig,
  type ResolvedHeaderedItemConfigHeader,
  type ResolvedItemConfig,
  type ResolvedLayoutConfig,
  type ResolvedLayoutConfigDimensions,
  type ResolvedLayoutConfigHeader,
  type ResolvedLayoutConfigSettings,
  type ResolvedPopoutLayoutConfig,
  type ResolvedPopoutLayoutConfigWindow,
  type ResolvedRootItemConfig,
  type ResolvedRowOrColumnItemConfig,
  type ResolvedRowOrColumnItemConfigChildItemConfig,
  type ResolvedStackItemConfig,
} from './resolved-config';

function assertContentArray(
  content: ItemConfig[] | undefined,
  ownerName: string,
): asserts content is ItemConfig[] | undefined {
  if (content !== undefined && !Array.isArray(content)) {
    throw new ConfigurationError(
      `${ownerName}.content must be an array`,
      JSON.stringify(content),
    );
  }
}

function assertOptionalConfigObject(value: unknown, name: string): void {
  if (
    value !== undefined &&
    (value === null || typeof value !== 'object' || Array.isArray(value))
  ) {
    throw new ConfigurationError(`${name} must be an object`);
  }
}

function resolveBoolean(
  value: unknown,
  defaultValue: boolean,
  name: string,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new ConfigurationError(`${name} must be a boolean`);
  }
  return value;
}

function resolveFiniteNumber(
  value: unknown,
  defaultValue: number,
  name: string,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConfigurationError(`${name} must be a finite number`);
  }
  return value;
}

function resolveString(
  value: unknown,
  defaultValue: string,
  name: string,
): string {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string') {
    throw new ConfigurationError(`${name} must be a string`);
  }
  return value;
}

function resolveNullableString(
  value: unknown,
  defaultValue: string | null,
  name: string,
): string | null {
  if (value === undefined || value === null) {
    return value === undefined ? defaultValue : null;
  }
  return resolveString(value, '', name);
}

function resolveStringOrFalse(
  value: unknown,
  defaultValue: string | false | undefined,
  name: string,
): string | false | undefined {
  if (value === undefined) return defaultValue;
  if (value !== false && typeof value !== 'string') {
    throw new ConfigurationError(`${name} must be a string or false`);
  }
  return value;
}

function resolveSideOrFalse(
  value: unknown,
  defaultValue: Side | false | undefined,
  name: string,
): Side | false | undefined {
  if (value === undefined) return defaultValue;
  if (
    value !== false &&
    value !== Side.top &&
    value !== Side.right &&
    value !== Side.bottom &&
    value !== Side.left
  ) {
    throw new ConfigurationError(`${name} must be a side or false`);
  }
  return value;
}

/** User-facing configuration shared by every layout item. @public */
export interface ItemConfig {
  /**
   * The type of the item. Possible values are 'row', 'column', 'stack', 'component'.
   */
  type: ItemType;

  /**
   * An array of configurations for items that will be created as children of this item.
   */
  content?: ItemConfig[];

  /**
   * The size of this item.
   * For rows, it specifies height. For columns, it specifies width.
   * Has format `<number><SizeUnit>`. Currently only supports units `fr` and `%`.
   *
   * Space is first proportionally allocated to items with sizeUnit `%`.
   * If there is any space left over (less than 100% allocated), then the
   * remainder is allocated to the items with unit `fr` according to the fractional size.
   * If more than 100% is allocated, then an extra 50% is allocated to items with unit `fr` and
   * is allocated to each item according to its fractional size. All item sizes are then adjusted
   * to bring the total back to 100%
   */
  size?: string;

  /**
   * The size of this item.
   * For rows, it specifies height. For columns, it specifies width.
   * Has format <number><sizeUnit>. Currently only supports units `px`
   */
  minSize?: string;

  /** A string that can be used to identify a ContentItem. */
  id?: string;

  /**
   * Determines if the item is closable. If false, the x on the item's tab will be hidden and
   * `container.close()` will leave the item open.
   * Default: true
   */
  isClosable?: boolean;
}

/**
 * Normalizes an item configuration and recursively resolves its descendants.
 *
 * @throws {@link ConfigurationError} When the tree is cyclic, malformed, deeper than 128 items, or contains more than 10,000 resolved nodes.
 * @public
 */
export function resolveItemConfig(itemConfig: ItemConfig): ResolvedItemConfig {
  return resolveItemConfigWithComponentReorderEnabledDefault(
    itemConfig,
    resolvedComponentItemConfigDefaultReorderEnabled,
  );
}

/** @internal */
export function resolveItemConfigWithComponentReorderEnabledDefault(
  itemConfig: ItemConfig,
  componentReorderEnabledDefault: boolean,
): ResolvedItemConfig {
  return resolveItemConfigWithBudget(
    itemConfig,
    createResolutionBudget(),
    0,
    componentReorderEnabledDefault,
  );
}

interface LayoutResolutionBudget {
  nodes: number;
  readonly cloneBudget: { nodes: number };
  readonly active: WeakSet<object>;
}

function createResolutionBudget(): LayoutResolutionBudget {
  return {
    nodes: 0,
    cloneBudget: { nodes: 0 },
    active: new WeakSet<object>(),
  };
}

function assertItemConfigObject(
  itemConfig: unknown,
): asserts itemConfig is ItemConfig {
  if (
    itemConfig === null ||
    typeof itemConfig !== 'object' ||
    Array.isArray(itemConfig)
  ) {
    throw new ConfigurationError('Layout item configuration must be an object');
  }
}

function resolveItemConfigWithBudget(
  itemConfig: ItemConfig,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedItemConfig {
  if (depth > maximumConfigDepth || budget.nodes >= maximumConfigNodes) {
    throw new ConfigurationError(
      'Layout configuration exceeds resource limits',
    );
  }
  assertItemConfigObject(itemConfig);
  if (budget.active.has(itemConfig)) {
    throw new ConfigurationError('Layout configuration contains a cycle');
  }

  budget.nodes++;
  budget.active.add(itemConfig);
  try {
    switch (itemConfig.type) {
      case ItemType.ground:
        throw new ConfigurationError(
          'ItemConfig cannot specify type ground',
          JSON.stringify(itemConfig),
        );
      case ItemType.row:
      case ItemType.column:
        return resolveRowOrColumnItemConfigWithBudget(
          itemConfig as RowOrColumnItemConfig,
          budget,
          depth,
          componentReorderEnabledDefault,
        );

      case ItemType.stack:
        return resolveStackItemConfigWithBudget(
          itemConfig as StackItemConfig,
          budget,
          depth,
          componentReorderEnabledDefault,
        );

      case ItemType.component:
        return resolveComponentItemConfigWithDefault(
          itemConfig as ComponentItemConfig,
          componentReorderEnabledDefault,
          budget.cloneBudget,
        );

      default:
        throw new ConfigurationError(
          `Unknown layout item type: ${String(itemConfig.type)}`,
        );
    }
  } finally {
    budget.active.delete(itemConfig);
  }
}

/**
 * Resolves an optional list of item configurations using one shared resource budget.
 *
 * @throws {@link ConfigurationError} When the content is cyclic, malformed, deeper than 128 items, or contains more than 10,000 resolved nodes.
 * @public
 */
export function resolveItemConfigContent(
  content: ItemConfig[] | undefined,
): ResolvedItemConfig[] {
  return resolveItemConfigContentWithBudget(
    content,
    createResolutionBudget(),
    0,
    resolvedComponentItemConfigDefaultReorderEnabled,
  );
}

function resolveItemConfigContentWithBudget(
  content: ItemConfig[] | undefined,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedItemConfig[] {
  assertContentArray(content, 'ItemConfig');
  if (content === undefined) {
    return [];
  } else {
    const count = content.length;
    if (count > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Layout configuration exceeds resource limits',
      );
    }
    const result = Array<ResolvedItemConfig>(count);
    for (let i = 0; i < count; i++) {
      result[i] = resolveItemConfigWithBudget(
        content[i],
        budget,
        depth,
        componentReorderEnabledDefault,
      );
    }
    return result;
  }
}

/**
 * Resolves item config id.
 * @public
 */
export function resolveItemConfigId(id: string | undefined): string {
  return resolveString(id, resolvedItemConfigDefaults.id, 'ItemConfig.id');
}

/**
 * Resolves item config size.
 * @public
 */
export function resolveItemConfigSize(size: string | undefined): SizeWithUnit {
  if (size === undefined) {
    return {
      size: resolvedItemConfigDefaults.size,
      sizeUnit: resolvedItemConfigDefaults.sizeUnit,
    };
  }
  if (typeof size !== 'string') {
    throw new ConfigurationError('ItemConfig.size must be a string');
  }
  return parseSize(size, [SizeUnit.Percent, SizeUnit.Fractional]);
}

/**
 * Resolves item config min size.
 * @public
 */
export function resolveItemConfigMinSize(
  minSize: string | undefined,
): UndefinableSizeWithUnit {
  if (minSize === undefined) {
    return {
      size: resolvedItemConfigDefaults.minSize,
      sizeUnit: resolvedItemConfigDefaults.minSizeUnit,
    };
  }
  if (typeof minSize !== 'string') {
    throw new ConfigurationError('ItemConfig.minSize must be a string');
  }
  return parseSize(minSize, [SizeUnit.Pixel]);
}

/**
 * Returns whether ground item config.
 * @public
 */
export function isGroundItemConfig(config: ItemConfig): config is ItemConfig {
  return config.type === ItemType.ground;
}
/**
 * Returns whether row item config.
 * @public
 */
export function isRowItemConfig(config: ItemConfig): config is ItemConfig {
  return config.type === ItemType.row;
}
/**
 * Returns whether column item config.
 * @public
 */
export function isColumnItemConfig(config: ItemConfig): config is ItemConfig {
  return config.type === ItemType.column;
}
/**
 * Returns whether stack item config.
 * @public
 */
export function isStackItemConfig(config: ItemConfig): config is ItemConfig {
  return config.type === ItemType.stack;
}
/**
 * Returns whether component item config.
 * @public
 */
export function isComponentItemConfig(
  config: ItemConfig,
): config is ComponentItemConfig {
  return config.type === ItemType.component;
}

// Stack or Component
/**
 * Defines the headered item config contract.
 * @public
 */
export interface HeaderedItemConfig extends ItemConfig {
  /** The header. */
  header?: HeaderedItemConfigHeader;
  /** The maximised. */
  maximised?: boolean;
}

/**
 * Defines the headered item config header contract.
 * @public
 */
export interface HeaderedItemConfigHeader {
  /** The show. */
  show?: false | Side;
  /** The popout. */
  popout?: false | string;
  /** The dock. */
  dock?: false | string;
  /** The maximise. */
  maximise?: false | string;
  /** The close. */
  close?: string;
  /** The minimise. */
  minimise?: string;
  /** The tab dropdown. */
  tabDropdown?: false | string;
}

/**
 * Resolves headered item config header.
 * @public
 */
export function resolveHeaderedItemConfigHeader(
  header: HeaderedItemConfigHeader | undefined,
): ResolvedHeaderedItemConfigHeader | undefined {
  if (header === undefined) {
    return undefined;
  } else {
    assertOptionalConfigObject(header, 'HeaderedItemConfig.header');
    const result: ResolvedHeaderedItemConfigHeader = {
      show: resolveSideOrFalse(
        header.show,
        undefined,
        'HeaderedItemConfig.header.show',
      ),
      popout: resolveStringOrFalse(
        header.popout,
        undefined,
        'HeaderedItemConfig.header.popout',
      ),
      dock: resolveStringOrFalse(
        header.dock,
        undefined,
        'HeaderedItemConfig.header.dock',
      ),
      maximise: resolveStringOrFalse(
        header.maximise,
        undefined,
        'HeaderedItemConfig.header.maximise',
      ),
      close:
        header.close === undefined
          ? undefined
          : resolveString(header.close, '', 'HeaderedItemConfig.header.close'),
      minimise:
        header.minimise === undefined
          ? undefined
          : resolveString(
              header.minimise,
              '',
              'HeaderedItemConfig.header.minimise',
            ),
      tabDropdown: resolveStringOrFalse(
        header.tabDropdown,
        undefined,
        'HeaderedItemConfig.header.tabDropdown',
      ),
    };
    return result;
  }
}

/**
 * Resolves headered item config id and maximised.
 * @public
 */
export function resolveHeaderedItemConfigIdAndMaximised(
  config: HeaderedItemConfig,
): {
  /** The normalized item identifier. */
  id: string;
  /** Whether the item is initially maximised. */
  maximised: boolean;
} {
  return {
    id: resolveItemConfigId(config.id),
    maximised: resolveBoolean(
      config.maximised,
      false,
      'HeaderedItemConfig.maximised',
    ),
  };
}

/** Stack item input accepted by the Strelit configuration resolver. @public */
export interface StackItemConfig extends HeaderedItemConfig {
  /** The type. */
  type: 'stack';
  /** The content. */
  content: ComponentItemConfig[];
  /** The index of the item in content which is to be active*/
  activeItemIndex?: number;
}

/**
 * Normalizes a stack and its component children.
 *
 * @throws {@link ConfigurationError} When the stack exceeds configuration resource limits.
 * @public
 */
export function resolveStackItemConfig(
  itemConfig: StackItemConfig,
): ResolvedStackItemConfig {
  assertItemConfigObject(itemConfig);
  if (itemConfig.type !== ItemType.stack) {
    throw new ConfigurationError(
      'Invalid StackItemConfig.type',
      JSON.stringify(itemConfig),
    );
  }
  return resolveItemConfigWithBudget(
    itemConfig,
    createResolutionBudget(),
    0,
    resolvedComponentItemConfigDefaultReorderEnabled,
  ) as ResolvedStackItemConfig;
}

function resolveStackItemConfigWithBudget(
  itemConfig: StackItemConfig,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedStackItemConfig {
  const { id, maximised } = resolveHeaderedItemConfigIdAndMaximised(itemConfig);
  const { size, sizeUnit } = resolveItemConfigSize(itemConfig.size);
  const { size: minSize, sizeUnit: minSizeUnit } = resolveItemConfigMinSize(
    itemConfig.minSize,
  );

  const content = resolveStackItemConfigContentWithBudget(
    itemConfig.content,
    budget,
    depth + 1,
    componentReorderEnabledDefault,
  );
  const configuredActiveItemIndex = itemConfig.activeItemIndex;
  if (
    configuredActiveItemIndex !== undefined &&
    (!Number.isInteger(configuredActiveItemIndex) ||
      configuredActiveItemIndex < 0 ||
      (content.length > 0 && configuredActiveItemIndex >= content.length))
  ) {
    throw new ConfigurationError(
      'StackItemConfig.activeItemIndex must be an in-range integer',
      JSON.stringify(configuredActiveItemIndex),
    );
  }
  const result: ResolvedStackItemConfig = {
    type: ItemType.stack,
    content,
    size,
    sizeUnit,
    minSize,
    minSizeUnit,
    id,
    maximised,
    isClosable: resolveBoolean(
      itemConfig.isClosable,
      resolvedItemConfigDefaults.isClosable,
      'StackItemConfig.isClosable',
    ),
    activeItemIndex:
      content.length === 0
        ? undefined
        : (itemConfig.activeItemIndex ??
          resolvedStackItemConfigDefaultActiveItemIndex),
    header: resolveHeaderedItemConfigHeader(itemConfig.header),
  };
  return result;
}

/**
 * Creates stack item config from resolved.
 * @public
 */
export function createStackItemConfigFromResolved(
  resolvedConfig: ResolvedStackItemConfig,
): StackItemConfig {
  const result: StackItemConfig = {
    type: ItemType.stack,
    content: createStackItemConfigContentFromResolved(resolvedConfig.content),
    size: formatSize(resolvedConfig.size, resolvedConfig.sizeUnit),
    minSize: formatUndefinableSize(
      resolvedConfig.minSize,
      resolvedConfig.minSizeUnit,
    ),
    id: resolvedConfig.id,
    maximised: resolvedConfig.maximised,
    isClosable: resolvedConfig.isClosable,
    activeItemIndex: resolvedConfig.activeItemIndex,
    header: createResolvedHeaderedItemConfigHeaderCopy(resolvedConfig.header),
  };

  return result;
}

/**
 * Resolves the component children of a stack with bounded processing.
 *
 * @throws {@link ConfigurationError} When the content exceeds configuration resource limits.
 * @public
 */
export function resolveStackItemConfigContent(
  content: ComponentItemConfig[] | undefined,
): ResolvedComponentItemConfig[] {
  return resolveStackItemConfigContentWithBudget(
    content,
    createResolutionBudget(),
    0,
    resolvedComponentItemConfigDefaultReorderEnabled,
  );
}

function resolveStackItemConfigContentWithBudget(
  content: ComponentItemConfig[] | undefined,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedComponentItemConfig[] {
  assertContentArray(content, 'StackItemConfig');
  if (content === undefined) {
    return [];
  } else {
    const count = content.length;
    if (count > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Layout configuration exceeds resource limits',
      );
    }
    const result = Array<ResolvedComponentItemConfig>(count);
    for (let i = 0; i < count; i++) {
      const childItemConfig = content[i];
      const itemConfig = resolveItemConfigWithBudget(
        childItemConfig,
        budget,
        depth,
        componentReorderEnabledDefault,
      );
      if (!isResolvedComponentItemConfig(itemConfig)) {
        throw new ConfigurationError(
          'StackItemConfig.content must contain only component items',
          JSON.stringify(itemConfig),
        );
      } else {
        result[i] = itemConfig;
      }
    }
    return result;
  }
}

/**
 * Creates stack item config content from resolved.
 * @public
 */
export function createStackItemConfigContentFromResolved(
  resolvedContent: ResolvedComponentItemConfig[],
): ComponentItemConfig[] {
  const count = resolvedContent.length;
  const result = Array<ComponentItemConfig>(count);
  for (let i = 0; i < count; i++) {
    const resolvedContentConfig = resolvedContent[i];
    result[i] = createComponentItemConfigFromResolved(resolvedContentConfig);
  }
  return result;
}

/** Configuration for a component hosted within a layout item. @public */
export interface ComponentItemConfig extends HeaderedItemConfig {
  /** The type. */
  type: 'component';
  /** The content. */
  readonly content?: [];

  /**
   * The title of the item as displayed on its tab and on popout windows
   * Default: componentType.toString() or ''
   */
  title?: string;

  /**
   * The type of the component.
   * `componentType` must be of type `string` if it is registered with any of the following functions:
   * * `StrelitLayout.registerComponentConstructor()`
   * * `StrelitLayout.registerComponentFactoryFunction()`
   */
  componentType?: ComponentType;
  /**
   * The state information with which a component will be initialised with.
   * Will be passed to the component constructor function and will be the value returned by
   * container.initialState. APIs that copy this value reject cycles, depths above 128, and
   * values containing more than 10,000 nodes with a {@link ConfigurationError}.
   */
  componentState?: SerializableValue;

  /**
   * Default: true
   */
  reorderEnabled?: boolean; // Takes precedence over LayoutConfig.reorderEnabled.
}

/**
 * Resolves component item config.
 * @public
 */
export function resolveComponentItemConfig(
  itemConfig: ComponentItemConfig,
): ResolvedComponentItemConfig {
  assertItemConfigObject(itemConfig);
  if (itemConfig.type !== ItemType.component) {
    throw new ConfigurationError(
      'Invalid ComponentItemConfig.type',
      JSON.stringify(itemConfig),
    );
  }
  return resolveComponentItemConfigWithDefault(
    itemConfig,
    resolvedComponentItemConfigDefaultReorderEnabled,
    { nodes: 0 },
  );
}

function resolveComponentItemConfigWithDefault(
  itemConfig: ComponentItemConfig,
  reorderEnabledDefault: boolean,
  cloneBudget?: { nodes: number },
): ResolvedComponentItemConfig {
  const unresolvedComponentType = itemConfig.componentType;
  if (unresolvedComponentType === undefined) {
    throw new ConfigurationError(
      'ComponentItemConfig.componentType is undefined',
    );
  } else {
    const componentType = deepCloneValue(
      unresolvedComponentType,
      cloneBudget,
    ) as ComponentType;
    const { id, maximised } =
      resolveHeaderedItemConfigIdAndMaximised(itemConfig);
    let title: string;
    if (itemConfig.title === undefined || itemConfig.title === '') {
      title = componentTypeToTitle(componentType);
    } else {
      title = resolveString(itemConfig.title, '', 'ComponentItemConfig.title');
    }
    const { size, sizeUnit } = resolveItemConfigSize(itemConfig.size);
    const { size: minSize, sizeUnit: minSizeUnit } = resolveItemConfigMinSize(
      itemConfig.minSize,
    );
    const result: ResolvedComponentItemConfig = {
      type: itemConfig.type,
      content: [],
      size,
      sizeUnit,
      minSize,
      minSizeUnit,
      id,
      maximised,
      isClosable: resolveBoolean(
        itemConfig.isClosable,
        resolvedItemConfigDefaults.isClosable,
        'ComponentItemConfig.isClosable',
      ),
      reorderEnabled: resolveBoolean(
        itemConfig.reorderEnabled,
        reorderEnabledDefault,
        'ComponentItemConfig.reorderEnabled',
      ),
      title,
      header: resolveHeaderedItemConfigHeader(itemConfig.header),
      componentType,
      componentState: deepCloneValue(
        itemConfig.componentState,
        cloneBudget,
      ) as SerializableValue,
    };
    return result;
  }
}

/**
 * Creates component item config from resolved.
 * @public
 */
export function createComponentItemConfigFromResolved(
  resolvedConfig: ResolvedComponentItemConfig,
): ComponentItemConfig {
  const result: ComponentItemConfig = {
    type: ItemType.component,
    size: formatSize(resolvedConfig.size, resolvedConfig.sizeUnit),
    minSize: formatUndefinableSize(
      resolvedConfig.minSize,
      resolvedConfig.minSizeUnit,
    ),
    id: resolvedConfig.id,
    maximised: resolvedConfig.maximised,
    isClosable: resolvedConfig.isClosable,
    reorderEnabled: resolvedConfig.reorderEnabled,
    title: resolvedConfig.title,
    header: createResolvedHeaderedItemConfigHeaderCopy(resolvedConfig.header),
    componentType: deepCloneValue(
      resolvedConfig.componentType,
    ) as ComponentType,
    componentState: deepCloneValue(
      resolvedConfig.componentState,
    ) as SerializableValue,
  };

  return result;
}

/**
 * Performs the component type to title operation.
 * @public
 */
export function componentTypeToTitle(componentType: ComponentType): string {
  const componentTypeType = typeof componentType;
  switch (componentTypeType) {
    case 'string':
      return componentType as string;
    case 'number':
      return (componentType as number).toString();
    case 'boolean':
      return (componentType as boolean).toString();
    default:
      return '';
  }
}

// RowOrColumn
/**
 * Defines the row or column item config contract.
 * @public
 */
export interface RowOrColumnItemConfig extends ItemConfig {
  /** The type. */
  type: 'row' | 'column';
  /** The content. */
  content: (RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig)[];
}

/**
 * Represents row or column item config child item config.
 * @public
 */
export type RowOrColumnItemConfigChildItemConfig =
  RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig;

/**
 * Returns whether row or column item config child.
 * @public
 */
export function isRowOrColumnItemConfigChild(
  itemConfig: ItemConfig,
): itemConfig is RowOrColumnItemConfigChildItemConfig {
  switch (itemConfig.type) {
    case ItemType.row:
    case ItemType.column:
    case ItemType.stack:
    case ItemType.component:
      return true;
    case ItemType.ground:
      return false;
    default:
      throw new UnreachableCaseError('UROCOSPCICIC13687', itemConfig.type);
  }
}

/**
 * Resolves a row or column and all descendants using a shared resource budget.
 *
 * @throws {@link ConfigurationError} When the tree exceeds configuration resource limits.
 * @public
 */
export function resolveRowOrColumnItemConfig(
  itemConfig: RowOrColumnItemConfig,
): ResolvedRowOrColumnItemConfig {
  assertItemConfigObject(itemConfig);
  if (itemConfig.type !== ItemType.row && itemConfig.type !== ItemType.column) {
    throw new ConfigurationError(
      'Invalid RowOrColumnItemConfig.type',
      JSON.stringify(itemConfig),
    );
  }
  return resolveItemConfigWithBudget(
    itemConfig,
    createResolutionBudget(),
    0,
    resolvedComponentItemConfigDefaultReorderEnabled,
  ) as ResolvedRowOrColumnItemConfig;
}

function resolveRowOrColumnItemConfigWithBudget(
  itemConfig: RowOrColumnItemConfig,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedRowOrColumnItemConfig {
  const { size, sizeUnit } = resolveItemConfigSize(itemConfig.size);
  const { size: minSize, sizeUnit: minSizeUnit } = resolveItemConfigMinSize(
    itemConfig.minSize,
  );
  const result: ResolvedRowOrColumnItemConfig = {
    type: itemConfig.type,
    content: resolveRowOrColumnItemConfigContentWithBudget(
      itemConfig.content,
      budget,
      depth + 1,
      componentReorderEnabledDefault,
    ),
    size,
    sizeUnit,
    minSize,
    minSizeUnit,
    id: resolveItemConfigId(itemConfig.id),
    isClosable: resolveBoolean(
      itemConfig.isClosable,
      resolvedItemConfigDefaults.isClosable,
      'RowOrColumnItemConfig.isClosable',
    ),
  };
  return result;
}

/**
 * Creates row or column item config from resolved.
 * @public
 */
export function createRowOrColumnItemConfigFromResolved(
  resolvedConfig: ResolvedRowOrColumnItemConfig,
): RowOrColumnItemConfig {
  const result: RowOrColumnItemConfig = {
    type: resolvedConfig.type,
    content: createRowOrColumnItemConfigContentFromResolved(
      resolvedConfig.content,
    ),
    size: formatSize(resolvedConfig.size, resolvedConfig.sizeUnit),
    minSize: formatUndefinableSize(
      resolvedConfig.minSize,
      resolvedConfig.minSizeUnit,
    ),
    id: resolvedConfig.id,
    isClosable: resolvedConfig.isClosable,
  };

  return result;
}

/**
 * Resolves row or column children using one bounded traversal.
 *
 * @throws {@link ConfigurationError} When the content exceeds configuration resource limits.
 * @public
 */
export function resolveRowOrColumnItemConfigContent(
  content: RowOrColumnItemConfigChildItemConfig[] | undefined,
): ResolvedRowOrColumnItemConfigChildItemConfig[] {
  return resolveRowOrColumnItemConfigContentWithBudget(
    content,
    createResolutionBudget(),
    0,
    resolvedComponentItemConfigDefaultReorderEnabled,
  );
}

function resolveRowOrColumnItemConfigContentWithBudget(
  content: RowOrColumnItemConfigChildItemConfig[] | undefined,
  budget: LayoutResolutionBudget,
  depth: number,
  componentReorderEnabledDefault: boolean,
): ResolvedRowOrColumnItemConfigChildItemConfig[] {
  assertContentArray(content, 'RowOrColumnItemConfig');
  if (content === undefined) {
    return [];
  } else {
    const count = content.length;
    if (count > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Layout configuration exceeds resource limits',
      );
    }
    const result = Array<ResolvedRowOrColumnItemConfigChildItemConfig>(count);
    for (let i = 0; i < count; i++) {
      const childItemConfig = content[i];
      const resolvedChildItemConfig = resolveItemConfigWithBudget(
        childItemConfig,
        budget,
        depth,
        componentReorderEnabledDefault,
      );
      if (!isResolvedRowOrColumnItemConfigChild(resolvedChildItemConfig)) {
        throw new AssertError(
          'UROCOSPIC99512',
          JSON.stringify(resolvedChildItemConfig),
        );
      } else {
        result[i] = resolvedChildItemConfig;
      }
    }
    return result;
  }
}

/**
 * Creates row or column item config content from resolved.
 * @public
 */
export function createRowOrColumnItemConfigContentFromResolved(
  resolvedContent: readonly ResolvedRowOrColumnItemConfigChildItemConfig[],
): RowOrColumnItemConfigChildItemConfig[] {
  const count = resolvedContent.length;
  const result = Array<RowOrColumnItemConfigChildItemConfig>(count);
  for (let i = 0; i < count; i++) {
    const resolvedContentConfig = resolvedContent[i];
    const type = resolvedContentConfig.type;
    let contentConfig: RowOrColumnItemConfigChildItemConfig;
    switch (type) {
      case ItemType.row:
      case ItemType.column:
        contentConfig = createRowOrColumnItemConfigFromResolved(
          resolvedContentConfig,
        );
        break;
      case ItemType.stack:
        contentConfig = createStackItemConfigFromResolved(
          resolvedContentConfig,
        );
        break;
      case ItemType.component:
        contentConfig = createComponentItemConfigFromResolved(
          resolvedContentConfig,
        );
        break;
      default:
        throw new UnreachableCaseError('ROCICFRC44797', type);
    }
    result[i] = contentConfig;
  }
  return result;
}

/**
 * Represents root item config.
 * @public
 */
export type RootItemConfig =
  RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig;

/**
 * Returns whether root item config.
 * @public
 */
export function isRootItemConfig(
  itemConfig: ItemConfig,
): itemConfig is RootItemConfig {
  switch (itemConfig.type) {
    case ItemType.row:
    case ItemType.column:
    case ItemType.stack:
    case ItemType.component:
      return true;
    case ItemType.ground:
      return false;
    default:
      throw new UnreachableCaseError('URICIR23687', itemConfig.type);
  }
}

/**
 * Resolves an optional root item using bounded configuration processing.
 *
 * @throws {@link ConfigurationError} When the root exceeds configuration resource limits.
 * @public
 */
export function resolveRootItemConfig(
  itemConfig: RootItemConfig | undefined,
): ResolvedRootItemConfig | undefined {
  return resolveRootItemConfigWithBudget(
    itemConfig,
    createResolutionBudget(),
    resolvedComponentItemConfigDefaultReorderEnabled,
  );
}

function resolveRootItemConfigWithBudget(
  itemConfig: RootItemConfig | undefined,
  budget: LayoutResolutionBudget,
  componentReorderEnabledDefault: boolean,
): ResolvedRootItemConfig | undefined {
  if (itemConfig === undefined) {
    return undefined;
  } else {
    const result = resolveItemConfigWithBudget(
      itemConfig,
      budget,
      0,
      componentReorderEnabledDefault,
    );
    if (!isResolvedRootItemConfig(result)) {
      throw new ConfigurationError(
        'ItemConfig is not Row, Column or Stack',
        JSON.stringify(itemConfig),
      );
    } else {
      return result;
    }
  }
}

/**
 * Creates root item config from resolved.
 * @public
 */
export function createRootItemConfigFromResolved(
  resolvedItemConfig: ResolvedRootItemConfig | undefined,
): RootItemConfig | undefined {
  if (resolvedItemConfig === undefined) {
    return undefined;
  } else {
    const type = resolvedItemConfig.type;
    switch (type) {
      case ItemType.row:
      case ItemType.column:
        return createRowOrColumnItemConfigFromResolved(resolvedItemConfig);
      case ItemType.stack:
        return createStackItemConfigFromResolved(resolvedItemConfig);
      case ItemType.component:
        return createComponentItemConfigFromResolved(resolvedItemConfig);
      default:
        throw new UnreachableCaseError('RICFROU89921', type);
    }
  }
}

/**
 * Defines the layout config contract.
 * @public
 */
export interface LayoutConfig {
  /** The root. */
  root?: RootItemConfig | undefined;
  /** The open popouts. */
  openPopouts?: PopoutLayoutConfig[];
  /** The dimensions. */
  dimensions?: LayoutConfigDimensions;
  /** The settings. */
  settings?: LayoutConfigSettings;
  /** The header. */
  header?: LayoutConfigHeader;
}

/**
 * Use to specify LayoutConfig with defaults or deserialize a LayoutConfig.
 * @public
 */
export interface LayoutConfigSettings {
  /**
   * Constrains the area in which items can be dragged to the layout's container. Will be set to false
   * automatically when `layout.newDragSource()` is called.
   * Default: true
   */
  constrainDragToContainer?: boolean;

  /**
   * If true, the user can re-arrange the layout by dragging items by their tabs to the desired location.
   * Can be overridden by ItemConfig.reorderEnabled for specific ItemConfigs
   * Default: true
   */
  reorderEnabled?: boolean;

  /**
   * Decides what will be opened in a new window if the user clicks the popout icon. If true the entire stack will
   * be transferred to the new window, if false only the active component will be opened.
   * Default: false
   */
  popoutWholeStack?: boolean;

  /**
   * Specifies if an error is thrown when a popout is blocked by the browser (e.g. by opening it programmatically).
   * If false, the popout call will fail silently.
   * Default: true
   */
  blockedPopoutsThrowError?: boolean;

  /**
   * Closes child popout windows when their parent layout window unloads.
   * Default: true
   */
  closePopoutsOnUnload?: boolean;

  /**
   * Specifies Responsive Mode (more info needed).
   * Default: none
   */
  responsiveMode?: ResponsiveMode;

  /**
   * Specifies Maximum pixel overlap per tab.
   * Default: 0
   */
  tabOverlapAllowance?: number;

  /**
   *
   * Default: true
   */
  reorderOnTabMenuClick?: boolean;

  /**
   * Default: 10
   */
  tabControlOffset?: number;

  /**
   * Specifies whether to pop in elements when closing a popout window.
   * Default: false
   */
  popInOnClose?: boolean;
}

/**
 * Defines the layout config dimensions contract.
 * @public
 */
export interface LayoutConfigDimensions {
  /**
   * The width of the borders between the layout items in pixel. Please note: The actual draggable area is wider
   * than the visible one, making it safe to set this to small values without affecting usability.
   * Default: 5
   */
  borderWidth?: number;

  /**
   * Default: 5
   */
  borderGrabWidth?: number;

  /**
   * The minimum height an item can be resized to.
   * Default: 0
   */
  defaultMinItemHeight?: string;

  /**
   * The minimum width an item can be resized to.
   * Default: 10px
   */
  defaultMinItemWidth?: string;

  /**
   * The height of the header elements in pixel. This can be changed, but your theme's header css needs to be
   * adjusted accordingly.
   * Default: 20
   */
  headerHeight?: number;

  /**
   * The width of the element that appears when an item is dragged (in pixel).
   * Default: 300
   */
  dragProxyWidth?: number;

  /**
   * The height of the element that appears when an item is dragged (in pixel).
   * Default: 200
   */
  dragProxyHeight?: number;
}

/**
 * Defines the layout config header contract.
 * @public
 */
export interface LayoutConfigHeader {
  /**
   * Specifies whether header should be displayed, and if so, on which side.
   * If false, the layout will be displayed with splitters only.
   * Default: 'top'
   */
  show?: false | Side;
  /**
   * The tooltip text that appears when hovering over the popout icon or false if popout button not displayed.
   * Default: 'open in new window'
   */
  popout?: false | string;
  /**
   * The tooltip text that appears when hovering over the popin icon.
   * Default: 'dock'
   */
  popin?: string;
  /**
   * The tooltip text that appears when hovering over the maximise icon or false if maximised button not displayed.
   * Default: 'maximise'
   */
  maximise?: false | string;
  /**
   * The tooltip text that appears when hovering over the close icon.
   * Default: 'close'
   */
  close?: false | string;
  /**
   * The tooltip text that appears when hovering over the minimise icon.
   * Default: 'minimise'
   */
  minimise?: string;
  /**
   *
   * Default: 'additional tabs'
   */
  tabDropdown?: false | string;
}

/**
 * Resolves layout config settings.
 * @public
 */
export function resolveLayoutConfigSettings(
  settings: LayoutConfigSettings | undefined,
): ResolvedLayoutConfigSettings {
  assertOptionalConfigObject(settings, 'LayoutConfig.settings');
  const result: ResolvedLayoutConfigSettings = {
    constrainDragToContainer: resolveBoolean(
      settings?.constrainDragToContainer,
      resolvedLayoutConfigSettingsDefaults.constrainDragToContainer,
      'LayoutConfig.settings.constrainDragToContainer',
    ),
    reorderEnabled: resolveBoolean(
      settings?.reorderEnabled,
      resolvedLayoutConfigSettingsDefaults.reorderEnabled,
      'LayoutConfig.settings.reorderEnabled',
    ),
    popoutWholeStack: resolveBoolean(
      settings?.popoutWholeStack,
      resolvedLayoutConfigSettingsDefaults.popoutWholeStack,
      'LayoutConfig.settings.popoutWholeStack',
    ),
    blockedPopoutsThrowError: resolveBoolean(
      settings?.blockedPopoutsThrowError,
      resolvedLayoutConfigSettingsDefaults.blockedPopoutsThrowError,
      'LayoutConfig.settings.blockedPopoutsThrowError',
    ),
    closePopoutsOnUnload: resolveBoolean(
      settings?.closePopoutsOnUnload,
      resolvedLayoutConfigSettingsDefaults.closePopoutsOnUnload,
      'LayoutConfig.settings.closePopoutsOnUnload',
    ),
    responsiveMode: resolveResponsiveMode(settings?.responsiveMode),
    tabOverlapAllowance: resolveFiniteNumber(
      settings?.tabOverlapAllowance,
      resolvedLayoutConfigSettingsDefaults.tabOverlapAllowance,
      'LayoutConfig.settings.tabOverlapAllowance',
    ),
    reorderOnTabMenuClick: resolveBoolean(
      settings?.reorderOnTabMenuClick,
      resolvedLayoutConfigSettingsDefaults.reorderOnTabMenuClick,
      'LayoutConfig.settings.reorderOnTabMenuClick',
    ),
    tabControlOffset: resolveFiniteNumber(
      settings?.tabControlOffset,
      resolvedLayoutConfigSettingsDefaults.tabControlOffset,
      'LayoutConfig.settings.tabControlOffset',
    ),
    popInOnClose: resolveBoolean(
      settings?.popInOnClose,
      resolvedLayoutConfigSettingsDefaults.popInOnClose,
      'LayoutConfig.settings.popInOnClose',
    ),
  };
  return result;
}

function resolveResponsiveMode(value: unknown): ResponsiveMode {
  if (value === undefined) {
    return resolvedLayoutConfigSettingsDefaults.responsiveMode;
  }
  if (
    value !== ResponsiveMode.none &&
    value !== ResponsiveMode.always &&
    value !== ResponsiveMode.onload
  ) {
    throw new ConfigurationError(
      'LayoutConfig.settings.responsiveMode is invalid',
    );
  }
  return value;
}

/**
 * Resolves layout config dimensions.
 * @public
 */
export function resolveLayoutConfigDimensions(
  dimensions: LayoutConfigDimensions | undefined,
): ResolvedLayoutConfigDimensions {
  assertOptionalConfigObject(dimensions, 'LayoutConfig.dimensions');
  const { size: defaultMinItemHeight, sizeUnit: defaultMinItemHeightUnit } =
    resolveDefaultMinItemHeight(dimensions);
  const { size: defaultMinItemWidth, sizeUnit: defaultMinItemWidthUnit } =
    resolveDefaultMinItemWidth(dimensions);
  const result: ResolvedLayoutConfigDimensions = {
    borderWidth: resolvePixelDimension(
      'borderWidth',
      dimensions?.borderWidth,
      resolvedLayoutConfigDimensionsDefaults.borderWidth,
    ),
    borderGrabWidth: resolvePixelDimension(
      'borderGrabWidth',
      dimensions?.borderGrabWidth,
      resolvedLayoutConfigDimensionsDefaults.borderGrabWidth,
    ),
    defaultMinItemHeight,
    defaultMinItemHeightUnit,
    defaultMinItemWidth,
    defaultMinItemWidthUnit,
    headerHeight: resolvePixelDimension(
      'headerHeight',
      dimensions?.headerHeight,
      resolvedLayoutConfigDimensionsDefaults.headerHeight,
    ),
    dragProxyWidth: resolvePixelDimension(
      'dragProxyWidth',
      dimensions?.dragProxyWidth,
      resolvedLayoutConfigDimensionsDefaults.dragProxyWidth,
    ),
    dragProxyHeight: resolvePixelDimension(
      'dragProxyHeight',
      dimensions?.dragProxyHeight,
      resolvedLayoutConfigDimensionsDefaults.dragProxyHeight,
    ),
  };
  return result;
}

function resolvePixelDimension(
  name: keyof LayoutConfigDimensions,
  value: number | undefined,
  defaultValue: number,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new ConfigurationError(
      `Layout dimension ${name} must be finite and nonnegative`,
    );
  }
  return resolved;
}

/**
 * Creates layout config dimensions from resolved.
 * @public
 */
export function createLayoutConfigDimensionsFromResolved(
  resolvedDimensions: ResolvedLayoutConfigDimensions,
): LayoutConfigDimensions {
  const result: LayoutConfigDimensions = {
    borderWidth: resolvedDimensions.borderWidth,
    borderGrabWidth: resolvedDimensions.borderGrabWidth,
    defaultMinItemHeight: formatSize(
      resolvedDimensions.defaultMinItemHeight,
      resolvedDimensions.defaultMinItemHeightUnit,
    ),
    defaultMinItemWidth: formatSize(
      resolvedDimensions.defaultMinItemWidth,
      resolvedDimensions.defaultMinItemWidthUnit,
    ),
    headerHeight: resolvedDimensions.headerHeight,
    dragProxyWidth: resolvedDimensions.dragProxyWidth,
    dragProxyHeight: resolvedDimensions.dragProxyHeight,
  };

  return result;
}

function resolveDefaultMinItemHeight(
  dimensions: LayoutConfigDimensions | undefined,
): SizeWithUnit {
  const height = dimensions?.defaultMinItemHeight;
  if (height === undefined) {
    return {
      size: resolvedLayoutConfigDimensionsDefaults.defaultMinItemHeight,
      sizeUnit: resolvedLayoutConfigDimensionsDefaults.defaultMinItemHeightUnit,
    };
  } else {
    if (typeof height !== 'string') {
      throw new ConfigurationError(
        'LayoutConfig.dimensions.defaultMinItemHeight must be a string',
      );
    }
    return parseSize(height, [SizeUnit.Pixel]);
  }
}

function resolveDefaultMinItemWidth(
  dimensions: LayoutConfigDimensions | undefined,
): SizeWithUnit {
  const width = dimensions?.defaultMinItemWidth;
  if (width === undefined) {
    return {
      size: resolvedLayoutConfigDimensionsDefaults.defaultMinItemWidth,
      sizeUnit: resolvedLayoutConfigDimensionsDefaults.defaultMinItemWidthUnit,
    };
  } else {
    if (typeof width !== 'string') {
      throw new ConfigurationError(
        'LayoutConfig.dimensions.defaultMinItemWidth must be a string',
      );
    }
    return parseSize(width, [SizeUnit.Pixel]);
  }
}

/**
 * Resolves layout config header.
 * @public
 */
export function resolveLayoutConfigHeader(
  header: LayoutConfigHeader | undefined,
): ResolvedLayoutConfigHeader {
  assertOptionalConfigObject(header, 'LayoutConfig.header');
  const result: ResolvedLayoutConfigHeader = {
    show: resolveSideOrFalse(
      header?.show,
      resolvedLayoutConfigHeaderDefaults.show,
      'LayoutConfig.header.show',
    ) as Side | false,
    popout: resolveStringOrFalse(
      header?.popout,
      resolvedLayoutConfigHeaderDefaults.popout,
      'LayoutConfig.header.popout',
    ) as string | false,
    dock: resolveString(
      header?.popin,
      resolvedLayoutConfigHeaderDefaults.dock,
      'LayoutConfig.header.popin',
    ),
    maximise: resolveStringOrFalse(
      header?.maximise,
      resolvedLayoutConfigHeaderDefaults.maximise,
      'LayoutConfig.header.maximise',
    ) as string | false,
    close: resolveStringOrFalse(
      header?.close,
      resolvedLayoutConfigHeaderDefaults.close,
      'LayoutConfig.header.close',
    ) as string | false,
    minimise: resolveString(
      header?.minimise,
      resolvedLayoutConfigHeaderDefaults.minimise,
      'LayoutConfig.header.minimise',
    ),
    tabDropdown: resolveStringOrFalse(
      header?.tabDropdown,
      resolvedLayoutConfigHeaderDefaults.tabDropdown,
      'LayoutConfig.header.tabDropdown',
    ) as string | false,
  };
  return result;
}

/**
 * Returns whether popout layout config.
 * @public
 */
export function isPopoutLayoutConfig(
  config: LayoutConfig,
): config is PopoutLayoutConfig {
  return (
    'parentId' in config || 'indexInParent' in config || 'window' in config
  );
}

/**
 * Normalizes a layout, including nested items and open popouts, under one resource budget.
 *
 * @throws {@link ConfigurationError} When the configuration is cyclic, malformed, deeper than 128 items, or contains more than 10,000 resolved nodes.
 * @public
 */
export function resolveLayoutConfig(
  layoutConfig: LayoutConfig,
): ResolvedLayoutConfig {
  return resolveLayoutConfigWithBudget(layoutConfig, createResolutionBudget());
}

function resolveLayoutConfigWithBudget(
  layoutConfig: LayoutConfig,
  budget: LayoutResolutionBudget,
  forcePopout = false,
  popoutDepth = 0,
): ResolvedLayoutConfig {
  if (
    budget.nodes >= maximumConfigNodes ||
    (forcePopout && popoutDepth > maximumConfigDepth)
  ) {
    throw new ConfigurationError(
      'Layout configuration exceeds resource limits',
    );
  }
  if (
    layoutConfig === null ||
    typeof layoutConfig !== 'object' ||
    Array.isArray(layoutConfig)
  ) {
    throw new ConfigurationError('Layout configuration must be an object');
  }
  if (budget.active.has(layoutConfig)) {
    throw new ConfigurationError('Layout configuration contains a cycle');
  }

  budget.nodes++;
  budget.active.add(layoutConfig);
  try {
    if (forcePopout || isPopoutLayoutConfig(layoutConfig)) {
      return resolvePopoutLayoutConfigWithBudget(
        layoutConfig as PopoutLayoutConfig,
        budget,
        popoutDepth,
      );
    }

    const settings = resolveLayoutConfigSettings(layoutConfig.settings);
    return {
      resolved: true,
      root: resolveRootItemConfigWithBudget(
        layoutConfig.root,
        budget,
        settings.reorderEnabled,
      ),
      openPopouts: resolveOpenPopoutLayoutConfigsWithBudget(
        layoutConfig.openPopouts,
        budget,
        popoutDepth,
      ),
      dimensions: resolveLayoutConfigDimensions(layoutConfig.dimensions),
      settings,
      header: resolveLayoutConfigHeader(layoutConfig.header),
    };
  } finally {
    budget.active.delete(layoutConfig);
  }
}

/**
 * Creates layout config from resolved.
 * @public
 */
export function createLayoutConfigFromResolved(
  config: ResolvedLayoutConfig,
): LayoutConfig {
  const result: LayoutConfig = {
    root: createRootItemConfigFromResolved(config.root),
    openPopouts: createPopoutLayoutConfigArrayFromResolved(config.openPopouts),
    settings: createResolvedLayoutConfigSettingsCopy(config.settings),
    dimensions: createLayoutConfigDimensionsFromResolved(config.dimensions),
    header: createLayoutConfigHeaderFromResolved(config.header),
  };
  return result;
}

function createLayoutConfigHeaderFromResolved(
  header: ResolvedLayoutConfigHeader,
): LayoutConfigHeader {
  return {
    show: header.show,
    popout: header.popout,
    maximise: header.maximise,
    minimise: header.minimise,
    close: header.close,
    popin: header.dock,
    tabDropdown: header.tabDropdown,
  };
}

/**
 * Returns whether resolved layout config.
 * @public
 */
export function isResolvedLayoutConfig(
  configOrResolvedConfig: ResolvedLayoutConfig | LayoutConfig,
): configOrResolvedConfig is ResolvedLayoutConfig {
  const config = configOrResolvedConfig as ResolvedLayoutConfig;
  return config.resolved !== undefined && config.resolved === true;
}

/**
 * Resolves open popout configurations using one bounded traversal.
 *
 * @throws {@link ConfigurationError} When the popout graph exceeds configuration resource limits.
 * @public
 */
export function resolveOpenPopoutLayoutConfigs(
  popoutConfigs: PopoutLayoutConfig[] | undefined,
): ResolvedPopoutLayoutConfig[] {
  return resolveOpenPopoutLayoutConfigsWithBudget(
    popoutConfigs,
    createResolutionBudget(),
  );
}

function resolveOpenPopoutLayoutConfigsWithBudget(
  popoutConfigs: PopoutLayoutConfig[] | undefined,
  budget: LayoutResolutionBudget,
  popoutDepth = 0,
): ResolvedPopoutLayoutConfig[] {
  if (popoutConfigs === undefined) {
    return [];
  } else if (!Array.isArray(popoutConfigs)) {
    throw new ConfigurationError(
      'LayoutConfig.openPopouts must be an array',
      popoutConfigs,
    );
  } else {
    const count = popoutConfigs.length;
    if (count > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Layout configuration exceeds resource limits',
      );
    }
    const result = Array<ResolvedPopoutLayoutConfig>(count);
    for (let i = 0; i < count; i++) {
      result[i] = resolveLayoutConfigWithBudget(
        popoutConfigs[i],
        budget,
        true,
        popoutDepth + 1,
      ) as ResolvedPopoutLayoutConfig;
    }
    return result;
  }
}

/**
 * Defines the popout layout config contract.
 * @public
 */
export interface PopoutLayoutConfig extends LayoutConfig {
  /** The id of the element the item will be appended to on popIn
   * If null, append to topmost layout element
   */
  parentId?: string | null;
  /** The position of this element within its parent
   * If null, position is last
   */
  indexInParent?: number | null;
  /** The window. */
  window?: PopoutLayoutConfigWindow;
}

/**
 * Defines the popout layout config window contract.
 * @public
 */
export interface PopoutLayoutConfigWindow {
  /** The width. */
  width?: number;
  /** The height. */
  height?: number;
  /** The left. */
  left?: number;
  /** The top. */
  top?: number;
}

/**
 * Resolves popout layout config window.
 * @public
 */
export function resolvePopoutLayoutConfigWindow(
  window: PopoutLayoutConfigWindow | undefined,
): ResolvedPopoutLayoutConfigWindow {
  assertOptionalConfigObject(window, 'PopoutLayoutConfig.window');
  const defaults = resolvedPopoutLayoutConfigWindowDefaults;
  return {
    width: resolveNullableFiniteNumber(
      window?.width,
      defaults.width,
      'PopoutLayoutConfig.window.width',
    ),
    height: resolveNullableFiniteNumber(
      window?.height,
      defaults.height,
      'PopoutLayoutConfig.window.height',
    ),
    left: resolveNullableFiniteNumber(
      window?.left,
      defaults.left,
      'PopoutLayoutConfig.window.left',
    ),
    top: resolveNullableFiniteNumber(
      window?.top,
      defaults.top,
      'PopoutLayoutConfig.window.top',
    ),
  };
}

function resolveNullableFiniteNumber(
  value: unknown,
  defaultValue: number | null,
  name: string,
): number | null {
  if (value === undefined || value === null) {
    return value === undefined ? defaultValue : null;
  }
  return resolveFiniteNumber(value, 0, name);
}

function resolveNullableInteger(
  value: unknown,
  defaultValue: number | null,
  name: string,
): number | null {
  const result = resolveNullableFiniteNumber(value, defaultValue, name);
  if (result !== null && !Number.isInteger(result)) {
    throw new ConfigurationError(`${name} must be an integer or null`);
  }
  return result;
}

/**
 * Creates popout layout config window from resolved.
 * @public
 */
export function createPopoutLayoutConfigWindowFromResolved(
  resolvedWindow: ResolvedPopoutLayoutConfigWindow,
): PopoutLayoutConfigWindow {
  const result: PopoutLayoutConfigWindow = {
    width: resolvedWindow.width === null ? undefined : resolvedWindow.width,
    height: resolvedWindow.height === null ? undefined : resolvedWindow.height,
    left: resolvedWindow.left === null ? undefined : resolvedWindow.left,
    top: resolvedWindow.top === null ? undefined : resolvedWindow.top,
  };

  return result;
}

/**
 * Resolves a popout and its nested layout using bounded configuration processing.
 *
 * @throws {@link ConfigurationError} When the popout graph exceeds configuration resource limits.
 * @public
 */
export function resolvePopoutLayoutConfig(
  popoutConfig: PopoutLayoutConfig,
): ResolvedPopoutLayoutConfig {
  return resolveLayoutConfigWithBudget(
    popoutConfig,
    createResolutionBudget(),
    true,
  ) as ResolvedPopoutLayoutConfig;
}

function resolvePopoutLayoutConfigWithBudget(
  popoutConfig: PopoutLayoutConfig,
  budget: LayoutResolutionBudget,
  popoutDepth: number,
): ResolvedPopoutLayoutConfig {
  const settings = resolveLayoutConfigSettings(popoutConfig.settings);
  return {
    root: resolveRootItemConfigWithBudget(
      popoutConfig.root,
      budget,
      settings.reorderEnabled,
    ),
    openPopouts: resolveOpenPopoutLayoutConfigsWithBudget(
      popoutConfig.openPopouts,
      budget,
      popoutDepth,
    ),
    dimensions: resolveLayoutConfigDimensions(popoutConfig.dimensions),
    settings,
    header: resolveLayoutConfigHeader(popoutConfig.header),
    parentId: resolveNullableString(
      popoutConfig.parentId,
      null,
      'PopoutLayoutConfig.parentId',
    ),
    indexInParent: resolveNullableInteger(
      popoutConfig.indexInParent,
      null,
      'PopoutLayoutConfig.indexInParent',
    ),
    window: resolvePopoutLayoutConfigWindow(popoutConfig.window),
    resolved: true,
  };
}

/**
 * Creates popout layout config from resolved.
 * @public
 */
export function createPopoutLayoutConfigFromResolved(
  resolvedConfig: ResolvedPopoutLayoutConfig,
): PopoutLayoutConfig {
  const result: PopoutLayoutConfig = {
    root: createRootItemConfigFromResolved(resolvedConfig.root),
    openPopouts: createPopoutLayoutConfigArrayFromResolved(
      resolvedConfig.openPopouts,
    ),
    dimensions: createLayoutConfigDimensionsFromResolved(
      resolvedConfig.dimensions,
    ),
    settings: createResolvedLayoutConfigSettingsCopy(resolvedConfig.settings),
    header: createLayoutConfigHeaderFromResolved(resolvedConfig.header),
    parentId: resolvedConfig.parentId,
    indexInParent: resolvedConfig.indexInParent,
    window: createPopoutLayoutConfigWindowFromResolved(resolvedConfig.window),
  };

  return result;
}

/**
 * Creates popout layout config array from resolved.
 * @public
 */
export function createPopoutLayoutConfigArrayFromResolved(
  resolvedArray: ResolvedPopoutLayoutConfig[],
): PopoutLayoutConfig[] {
  const resolvedOpenPopoutCount = resolvedArray.length;
  const result = Array<PopoutLayoutConfig>(resolvedOpenPopoutCount);
  for (let i = 0; i < resolvedOpenPopoutCount; i++) {
    const resolvedOpenPopout = resolvedArray[i];
    result[i] = createPopoutLayoutConfigFromResolved(resolvedOpenPopout);
  }

  return result;
}

/**
 * Defines the size with unit contract.
 * @public
 */
export interface SizeWithUnit {
  /** The size. */
  size: number;
  /** The size unit. */
  sizeUnit: SizeUnit;
}

/**
 * Defines the undefinable size with unit contract.
 * @public
 */
export interface UndefinableSizeWithUnit {
  /** The size. */
  size: number | undefined;
  /** The size unit. */
  sizeUnit: SizeUnit;
}

/** @internal */
export function parseSize(
  sizeString: string,
  allowableSizeUnits: readonly SizeUnit[],
): SizeWithUnit {
  const {
    numericPart: digitsPart,
    firstNonNumericCharPart: firstNonDigitPart,
  } = splitStringAtFirstNonNumericChar(sizeString);
  const size = Number.parseFloat(digitsPart);
  if (!Number.isFinite(size)) {
    throw new ConfigurationError(
      `${i18nStrings[I18nStringId.InvalidNumberPartInSizeString]}: ${sizeString}`,
    );
  } else if (size < 0) {
    throw new ConfigurationError(`Size cannot be negative: ${sizeString}`);
  } else {
    const sizeUnit = tryParseSizeUnit(firstNonDigitPart);
    if (sizeUnit === undefined) {
      throw new ConfigurationError(
        `${i18nStrings[I18nStringId.UnknownUnitInSizeString]}: ${sizeString}`,
      );
    } else {
      if (!allowableSizeUnits.includes(sizeUnit)) {
        throw new ConfigurationError(
          `${i18nStrings[I18nStringId.UnsupportedUnitInSizeString]}: ${sizeString}`,
        );
      } else {
        return { size, sizeUnit };
      }
    }
  }
}

/** @internal */
export function formatSize(size: number, sizeUnit: SizeUnit) {
  return size.toString(10) + formatSizeUnit(sizeUnit);
}

/** @internal */
export function formatUndefinableSize(
  size: number | undefined,
  sizeUnit: SizeUnit,
) {
  if (size === undefined) {
    return undefined;
  } else {
    return size.toString(10) + formatSizeUnit(sizeUnit);
  }
}
