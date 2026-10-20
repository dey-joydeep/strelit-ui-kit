import { ConfigurationError } from '../errors/external-error';
import { maximumConfigDepth, maximumConfigNodes } from './resource-limits';
import { WidthAndHeight } from './types';

/** @internal */
export function numberToPixels(value: number): string {
  return value.toString(10) + 'px';
}

/** @internal */
export function pixelsToNumber(value: string): number {
  const numberStr = value.replace('px', '');
  return Number.parseFloat(numberStr);
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
  }

  let firstNonDigitPartIndex = length;
  let gotDecimalPoint = false;
  for (let i = 0; i < length; i++) {
    const char = value[i];
    if (isDigit(char)) {
      continue;
    }
    if (char === '.' && !gotDecimalPoint) {
      gotDecimalPoint = true;
      continue;
    }
    firstNonDigitPartIndex = i;
    break;
  }

  return {
    numericPart: value.substring(0, firstNonDigitPartIndex),
    firstNonNumericCharPart: value.substring(firstNonDigitPartIndex).trim(),
  };
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

function createCloneBudget(): { nodes: number } {
  return { nodes: 0 };
}

/**
 * Clones serializable component state without recursive call-stack growth.
 *
 * @throws {@link ConfigurationError} When the value is cyclic, deeper than 128 levels, or contains more than 10,000 nodes.
 * @internal
 */
export function deepCloneValue(
  value: unknown,
  budget: { nodes: number } = createCloneBudget(),
): unknown {
  interface CloneFrame {
    readonly source: object;
    readonly target: unknown[] | Record<string, unknown>;
    readonly entries: readonly (readonly [string, unknown])[];
    readonly depth: number;
    index: number;
  }

  const active = new WeakSet<object>();
  function createArrayClone(
    source: unknown[],
    depth: number,
  ): { clone: unknown[]; frame: CloneFrame } {
    if (source.length > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Serializable value exceeds resource limits',
      );
    }
    const entries: [string, unknown][] = [];
    for (let index = 0; index < source.length; index++) {
      if (index in source) {
        entries.push([index.toString(), source[index]]);
      }
    }
    if (entries.length !== source.length) {
      throw new ConfigurationError('Value is not serializable');
    }
    const clone: unknown[] = [];
    clone.length = source.length;
    return {
      clone,
      frame: { source, target: clone, entries, depth, index: 0 },
    };
  }

  function createRecordClone(
    source: object,
    depth: number,
  ): { clone: Record<string, unknown>; frame: CloneFrame } {
    try {
      const prototype = Object.getPrototypeOf(source);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) {
        throw new ConfigurationError('Value is not serializable');
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError('Value is not serializable');
    }

    const entries = Object.entries(source);
    if (entries.length > maximumConfigNodes - budget.nodes) {
      throw new ConfigurationError(
        'Serializable value exceeds resource limits',
      );
    }
    const clone: Record<string, unknown> = {};
    return {
      clone,
      frame: { source, target: clone, entries, depth, index: 0 },
    };
  }

  function createClone(
    source: unknown,
    depth: number,
  ): { clone: unknown; frame?: CloneFrame } {
    budget.nodes++;
    if (budget.nodes > maximumConfigNodes) {
      throw new ConfigurationError(
        'Serializable value exceeds resource limits',
      );
    }
    if (source === undefined) {
      if (depth === 0) {
        return { clone: source };
      }
      throw new ConfigurationError('Value is not serializable');
    }
    if (
      source === null ||
      typeof source === 'string' ||
      typeof source === 'boolean'
    ) {
      return { clone: source };
    }
    if (typeof source === 'number') {
      if (Number.isFinite(source)) {
        return { clone: source };
      }
      throw new ConfigurationError('Value is not serializable');
    }
    if (typeof source !== 'object') {
      throw new ConfigurationError('Value is not serializable');
    }
    if (depth > maximumConfigDepth) {
      throw new ConfigurationError(
        'Serializable value exceeds resource limits',
      );
    }
    if (active.has(source)) {
      throw new ConfigurationError('Serializable value contains a cycle');
    }

    active.add(source);
    if (Array.isArray(source)) {
      return createArrayClone(source, depth);
    }
    return createRecordClone(source, depth);
  }

  const root = createClone(value, 0);
  if (root.frame === undefined) {
    return root.clone;
  }

  const stack = [root.frame];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.entries.length) {
      active.delete(frame.source);
      stack.pop();
      continue;
    }

    const [key, entry] = frame.entries[frame.index++];
    const child = createClone(entry, frame.depth + 1);
    Object.defineProperty(frame.target, key, {
      configurable: true,
      enumerable: true,
      value: child.clone,
      writable: true,
    });
    if (child.frame !== undefined) {
      stack.push(child.frame);
    }
  }

  return root.clone;
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
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/** @internal */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  } else if (typeof e === 'string') {
    return e;
  } else {
    return 'Unknown Error';
  }
}
