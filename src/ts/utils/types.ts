import { UnreachableCaseError } from '../errors/internal-error';
import { StyleConstants } from './style-constants';

/** @internal */
export const WidthOrHeightPropertyName = {
  width: 'width',
  height: 'height',
} as const;

/** @internal */
export type WidthOrHeightPropertyName =
  (typeof WidthOrHeightPropertyName)[keyof typeof WidthOrHeightPropertyName];

/** @internal */
export interface WidthAndHeight {
  width: number;
  height: number;
}

/** @internal */
export interface LeftAndTop {
  left: number;
  top: number;
}

/**
 * Provides the side.
 * @public
 */
export const Side = {
  /** The top. */
  top: 'top',
  /** The left. */
  left: 'left',
  /** The right. */
  right: 'right',
  /** The bottom. */
  bottom: 'bottom',
} as const;

/**
 * Represents side.
 * @public
 */
export type Side = (typeof Side)[keyof typeof Side];

/**
 * Provides the logical zindex.
 * @public
 */
export const LogicalZIndex = {
  /** The base. */
  base: 'base',
  /** The drag. */
  drag: 'drag',
  /** The stack maximised. */
  stackMaximised: 'stackMaximised',
} as const;

/**
 * Represents logical zindex.
 * @public
 */
export type LogicalZIndex = (typeof LogicalZIndex)[keyof typeof LogicalZIndex];

/**
 * Provides the logical zindex to default map.
 * @public
 */
export const LogicalZIndexToDefaultMap = {
  /** The public api. */
  [LogicalZIndex.base]: StyleConstants.defaultComponentBaseZIndex,
  /** The public api. */
  [LogicalZIndex.drag]: StyleConstants.defaultComponentDragZIndex,
  /** The public api. */
  [LogicalZIndex.stackMaximised]:
    StyleConstants.defaultComponentStackMaximisedZIndex,
} as const;

/** @internal */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** @internal */
export interface AreaLinkedRect {
  /** The left edge. */
  x1: number;
  /** The right edge. */
  x2: number;
  /** The top edge. */
  y1: number;
  /** The bottom edge. */
  y2: number;
}

/**
 * Represents serializable value.
 * @public
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableObject
  | SerializableValueArray;

/**
 * Defines the serializable object contract.
 * @public
 */
export interface SerializableObject {
  [name: string]: SerializableValue;
}

/**
 * Represents serializable value array.
 * @public
 */
export type SerializableValueArray = SerializableValue[];

/**
 * Returns whether serializable object.
 * @public
 */
export function isSerializableObject(
  value: unknown,
): value is SerializableObject {
  return (
    !Array.isArray(value) &&
    value !== null &&
    typeof value === 'object' &&
    isSerializableValueInternal(value, new WeakSet())
  );
}

/**
 * Returns whether serializable record.
 * @public
 */
export function isSerializableRecord(
  value: unknown,
): value is SerializableObject {
  return isSerializableObject(value);
}

/**
 * Returns whether serializable value.
 * @public
 */
export function isSerializableValue(
  value: unknown,
): value is SerializableValue {
  return isSerializableValueInternal(value, new WeakSet());
}

function isSerializableValueInternal(
  value: unknown,
  seen: WeakSet<object>,
): value is SerializableValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const result = value.every((entry) =>
      isSerializableValueInternal(entry, seen),
    );
    seen.delete(value);
    return result;
  }
  if (value !== null && typeof value === 'object') {
    if (!hasPlainObjectPrototype(value)) {
      return false;
    }
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const result = Object.values(value).every((entry) =>
      isSerializableValueInternal(entry, seen),
    );
    seen.delete(value);
    return result;
  }
  return false;
}

function hasPlainObjectPrototype(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  } catch {
    return false;
  }
}

/**
 * Represents component type.
 * @public
 */
export type ComponentType = SerializableValue;

/**
 * Provides the item type.
 * @public
 */
export const ItemType = {
  /** The ground. */
  ground: 'ground',
  /** The row. */
  row: 'row',
  /** The column. */
  column: 'column',
  /** The stack. */
  stack: 'stack',
  /** The component. */
  component: 'component',
} as const;

/**
 * Represents item type.
 * @public
 */
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

/**
 * Provides the responsive mode.
 * @public
 */
export const ResponsiveMode = {
  /** The none. */
  none: 'none',
  /** The always. */
  always: 'always',
  /** The onload. */
  onload: 'onload',
} as const;

/**
 * Represents responsive mode.
 * @public
 */
export type ResponsiveMode =
  (typeof ResponsiveMode)[keyof typeof ResponsiveMode];

/**
 * Length units which can specify the size of a Component Item
 * @public
 */
export type SizeUnit = 'px' | '%' | 'fr' | 'em';

/**
 * Provides the size unit.
 * @public
 */
export const SizeUnit = {
  /** The pixel. */
  Pixel: 'px',
  /** The percent. */
  Percent: '%',
  /** The fractional. */
  Fractional: 'fr',
  /** The em. */
  Em: 'em',
} as const;

/**
 * Performs the try parse size unit operation.
 * @public
 */
export function tryParseSizeUnit(value: string): SizeUnit | undefined {
  switch (value) {
    case SizeUnit.Pixel:
      return SizeUnit.Pixel;
    case SizeUnit.Percent:
      return SizeUnit.Percent;
    case SizeUnit.Fractional:
      return SizeUnit.Fractional;
    case SizeUnit.Em:
      return SizeUnit.Em;
    default:
      return undefined;
  }
}

/**
 * Performs the format size unit operation.
 * @public
 */
export function formatSizeUnit(value: SizeUnit): string {
  switch (value) {
    case SizeUnit.Pixel:
      return SizeUnit.Pixel;
    case SizeUnit.Percent:
      return SizeUnit.Percent;
    case SizeUnit.Fractional:
      return SizeUnit.Fractional;
    case SizeUnit.Em:
      return SizeUnit.Em;
    default:
      throw new UnreachableCaseError('SUEF44998', value);
  }
}
