import { WidthAndHeight } from './types';

/** @internal */
export function numberToPixels(value: number): string {
  return value.toString(10) + 'px';
}

/** @internal */
export function pixelsToNumber(value: string): number {
  const numberStr = value.replace('px', '');
  return parseFloat(numberStr);
}

/** @internal */
export interface SplitStringAtFirstNonNumericCharResult {
  numericPart: string;
  firstNonNumericCharPart: string;
}

/** @internal */
export function splitStringAtFirstNonNumericChar(
  value: string,
): SplitStringAtFirstNonNumericCharResult {
  value = value.trimStart();

  const length = value.length;
  if (length === 0) {
    return { numericPart: '', firstNonNumericCharPart: '' };
  } else {
    let firstNonDigitPartIndex = length;
    let gotDecimalPoint = false;
    for (let i = 0; i < length; i++) {
      const char = value[i];
      if (!isDigit(char)) {
        if (char !== '.') {
          firstNonDigitPartIndex = i;
          break;
        } else {
          if (gotDecimalPoint) {
            firstNonDigitPartIndex = i;
            break;
          } else {
            gotDecimalPoint = true;
          }
        }
      }
    }
    const digitsPart = value.substring(0, firstNonDigitPartIndex);
    const firstNonDigitPart = value.substring(firstNonDigitPartIndex).trim();

    return {
      numericPart: digitsPart,
      firstNonNumericCharPart: firstNonDigitPart,
    };
  }
}

/** @internal */
export function isDigit(char: string) {
  return char >= '0' && char <= '9';
}

/** @internal */
export function getElementWidth(element: HTMLElement): number {
  return element.offsetWidth;
}

/** @internal */
export function setElementWidth(element: HTMLElement, width: number): void {
  const widthAsPixels = numberToPixels(width);
  element.style.width = widthAsPixels;
}

/** @internal */
export function getElementHeight(element: HTMLElement): number {
  return element.offsetHeight;
}

/** @internal */
export function setElementHeight(element: HTMLElement, height: number): void {
  const heightAsPixels = numberToPixels(height);
  element.style.height = heightAsPixels;
}

/** @internal */
export function getElementWidthAndHeight(element: HTMLElement): WidthAndHeight {
  return {
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/** @internal */
export function setElementDisplayVisibility(
  element: HTMLElement,
  visible: boolean,
): void {
  if (visible) {
    element.style.display = '';
  } else {
    element.style.display = 'none';
  }
}

/** @internal */
export function ensureElementPositionAbsolute(element: HTMLElement): void {
  const absolutePosition = 'absolute';
  if (element.style.position !== absolutePosition) {
    element.style.position = absolutePosition;
  }
}

/** @internal */
export function deepCloneValue(value: unknown): unknown {
  if (typeof value !== 'object') {
    return value;
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((element) => deepCloneValue(element));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = deepCloneValue(entry);
  }
  return result;
}

/** @internal */
export function removeFromArray<T>(item: T, array: T[]): void {
  const index = array.indexOf(item);

  if (index === -1) {
    throw new Error("Can't remove item from array. Item is not in the array");
  }

  array.splice(index, 1);
}

/** @internal */
export function getUniqueId(): string {
  return (Math.random() * 1000000000000000).toString(36).replace('.', '');
}

/** @internal */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  } else {
    if (typeof e === 'string') {
      return e;
    } else {
      return 'Unknown Error';
    }
  }
}
