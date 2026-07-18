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

/** @public */
export const Side = {
  top: 'top',
  left: 'left',
  right: 'right',
  bottom: 'bottom',
} as const;

/** @public */
export type Side = (typeof Side)[keyof typeof Side];

/** @public */
export const LogicalZIndex = {
  base: 'base',
  drag: 'drag',
  stackMaximised: 'stackMaximised',
} as const;

/** @public */
export type LogicalZIndex = (typeof LogicalZIndex)[keyof typeof LogicalZIndex];

/** @public */
export const LogicalZIndexToDefaultMap = {
  [LogicalZIndex.base]: StyleConstants.defaultComponentBaseZIndex,
  [LogicalZIndex.drag]: StyleConstants.defaultComponentDragZIndex,
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
  x1: number; // left
  x2: number; // nextLeft
  y1: number; // top
  y2: number; // nextTop
}

/** @public */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableObject
  | SerializableValueArray;

/** @public */
export interface SerializableObject {
  [name: string]: SerializableValue;
}

/** @public */
export type SerializableValueArray = SerializableValue[];

/** @public */
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

/** @public */
export function isSerializableRecord(
  value: unknown,
): value is SerializableObject {
  return isSerializableObject(value);
}

/** @public */
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

/** @public */
export type ComponentType = SerializableValue;

/** @public */
export const ItemType = {
  ground: 'ground',
  row: 'row',
  column: 'column',
  stack: 'stack',
  component: 'component',
} as const;

/** @public */
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

/** @public */
export const ResponsiveMode = {
  none: 'none',
  always: 'always',
  onload: 'onload',
} as const;

/** @public */
export type ResponsiveMode =
  (typeof ResponsiveMode)[keyof typeof ResponsiveMode];

/**
 * Length units which can specify the size of a Component Item
 * @public
 */
export type SizeUnit = 'px' | '%' | 'fr' | 'em';

/** @public */
export const SizeUnit = {
  Pixel: 'px',
  Percent: '%',
  Fractional: 'fr',
  Em: 'em',
} as const;

/** @public */
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

/** @public */
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
