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
export const SerializableValue = {
  isSerializableObject(value: SerializableValue): value is SerializableObject {
    return !Array.isArray(value) && value !== null && typeof value === 'object';
  },

  isSerializableRecord(value: SerializableValue): value is SerializableObject {
    return SerializableValue.isSerializableObject(value);
  },
} as const;

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
export type SizeUnitEnum = 'px' | '%' | 'fr' | 'em';

/** @public */
export const SizeUnitEnum = {
  Pixel: 'px',
  Percent: '%',
  Fractional: 'fr',
  Em: 'em',

  tryParse(value: string): SizeUnitEnum | undefined {
    switch (value) {
      case SizeUnitEnum.Pixel:
        return SizeUnitEnum.Pixel;
      case SizeUnitEnum.Percent:
        return SizeUnitEnum.Percent;
      case SizeUnitEnum.Fractional:
        return SizeUnitEnum.Fractional;
      case SizeUnitEnum.Em:
        return SizeUnitEnum.Em;
      default:
        return undefined;
    }
  },

  format(value: SizeUnitEnum): string {
    switch (value) {
      case SizeUnitEnum.Pixel:
        return SizeUnitEnum.Pixel;
      case SizeUnitEnum.Percent:
        return SizeUnitEnum.Percent;
      case SizeUnitEnum.Fractional:
        return SizeUnitEnum.Fractional;
      case SizeUnitEnum.Em:
        return SizeUnitEnum.Em;
      default:
        throw new UnreachableCaseError('SUEF44998', value);
    }
  },
} as const;
