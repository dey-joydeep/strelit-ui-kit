/**
 * Minifies and unminifies configs by replacing frequent keys
 * and values with compact base-36 substitutes. Config options must
 * retain array position/index, add new options at the end.
 * @internal
 */

import { ConfigurationError } from '../errors/external-error';
import { maximumConfigDepth, maximumConfigNodes } from './resource-limits';

// Resolved layouts interleave semantic item, content-array, popout, and state
// containers. Their representation can therefore be several times deeper than
// the independently bounded semantic structures they contain.
// A maximally nested resolved representation can combine three independent
// semantic domains on one path: popout configs (object + array), layout items
// (object + content array), and serializable component state (object). Keep a
// small allowance for the resolved-config wrapper and leaf containers.
const maximumTranslationDepth = maximumConfigDepth * 5 + 8;

const configMinifierKeys: readonly string[] = [
  'settings',
  'constrainDragToContainer',
  'dimensions',
  'borderWidth',
  'defaultMinItemHeight',
  'defaultMinItemWidth',
  'headerHeight',
  'dragProxyWidth',
  'dragProxyHeight',
  'header',
  'close',
  'maximise',
  'minimise',
  'popout',
  'content',
  'componentType',
  'componentState',
  'id',
  'size',
  'type',
  'minSize',
  'isClosable',
  'title',
  'popoutWholeStack',
  'openPopouts',
  'parentId',
  'activeItemIndex',
  'reorderEnabled',
  'borderGrabWidth',
  'sizeUnit',
  'minSizeUnit',
  'window',
  'indexInParent',
  'resolved',
  'show',
  'popInOnClose',
  'closePopoutsOnUnload',
];

const configMinifierValues: readonly (boolean | string)[] = [
  true,
  false,
  'row',
  'column',
  'stack',
  'component',
  'close',
  'maximise',
  'minimise',
  'open in new window',
];

export function checkConfigMinifierInitialise(): void {
  // Retained as an initialization hook for callers and future validation.
}

export function translateObject(
  from: Record<string, unknown>,
  minify: boolean,
): Record<string, unknown> {
  type Container = Record<string, unknown> | unknown[];
  type Frame =
    | {
        kind: 'enter';
        from: Container;
        to: Container;
        depth: number;
        representationDepth: number;
      }
    | {
        kind: 'iterate';
        from: Container;
        to: Container;
        depth: number;
        representationDepth: number;
        index: number;
        valueCount: number;
        array: unknown[] | undefined;
        keys: string[] | undefined;
      }
    | { kind: 'exit'; from: Container };

  const to: Record<string, unknown> = {};
  const stack: Frame[] = [
    { kind: 'enter', from, to, depth: 0, representationDepth: 0 },
  ];
  const ancestors = new WeakSet<object>();
  let nodes = 1;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    if (frame.kind === 'exit') {
      ancestors.delete(frame.from);
      continue;
    }
    if (frame.kind === 'enter') {
      if (
        frame.depth > maximumConfigDepth ||
        frame.representationDepth > maximumTranslationDepth
      ) {
        throwTranslationLimitError();
      }
      if (ancestors.has(frame.from)) {
        throw new ConfigurationError(
          'Configuration contains a cyclic object graph',
        );
      }
      ancestors.add(frame.from);

      const array = Array.isArray(frame.from) ? frame.from : undefined;
      const keys = array === undefined ? Object.keys(frame.from) : undefined;
      const valueCount = array === undefined ? keys!.length : array.length;
      if (valueCount > maximumConfigNodes - nodes) {
        throwTranslationLimitError();
      }
      nodes += valueCount;

      stack.push({ kind: 'exit', from: frame.from });
      if (valueCount > 0) {
        stack.push({
          kind: 'iterate',
          from: frame.from,
          to: frame.to,
          depth: frame.depth,
          representationDepth: frame.representationDepth,
          index: 0,
          valueCount,
          array,
          keys,
        });
      }
    } else {
      const { array, keys, index } = frame;
      const key = array === undefined ? keys![index] : index;
      const value =
        array !== undefined
          ? array[index]
          : (frame.from as Record<string, unknown>)[key as string];
      if (index + 1 < frame.valueCount) {
        stack.push({ ...frame, index: index + 1 });
      }

      let translatedValue: unknown;
      if (typeof value === 'object' && value !== null) {
        const childRepresentationDepth = frame.representationDepth + 1;
        const semanticKey =
          array === undefined
            ? minify
              ? (key as string)
              : unminifyKey(key as string)
            : undefined;
        const startsIndependentSemanticDomain =
          semanticKey === 'root' ||
          semanticKey === 'componentType' ||
          semanticKey === 'componentState' ||
          semanticKey === 'openPopouts';
        const childDepth = startsIndependentSemanticDomain
          ? 0
          : Array.isArray(value)
            ? frame.depth
            : frame.depth + 1;
        if (
          childDepth > maximumConfigDepth ||
          childRepresentationDepth > maximumTranslationDepth ||
          (Array.isArray(value) && value.length > maximumConfigNodes - nodes)
        ) {
          throwTranslationLimitError();
        }
        const childTo: Container = Array.isArray(value)
          ? Array<unknown>(value.length)
          : {};
        translatedValue = childTo;
        stack.push({
          kind: 'enter',
          from: value as Container,
          to: childTo,
          depth: childDepth,
          representationDepth: childRepresentationDepth,
        });
      } else {
        translatedValue = minify ? minifyValue(value) : unminifyValue(value);
      }

      if (Array.isArray(frame.to)) {
        frame.to[index] = translatedValue;
      } else {
        const translatedKey = minify
          ? minifyKey(key as string)
          : unminifyKey(key as string);
        Object.defineProperty(frame.to, translatedKey, {
          configurable: true,
          enumerable: true,
          value: translatedValue,
          writable: true,
        });
      }
    }
  }

  return to;
}

function throwTranslationLimitError(): never {
  throw new ConfigurationError(
    `Configuration exceeds the supported translation limit (${maximumTranslationDepth} representation levels and ${maximumConfigNodes} nodes)`,
  );
}

function minifyKey(value: string): string {
  if (value.startsWith('~')) {
    return `~${value}`;
  }

  if (value.startsWith('___')) {
    return '___' + value;
  }

  if (value.length === 1) {
    return '___' + value;
  }

  const index = indexOfKey(value);
  if (index === -1) {
    return value;
  }
  const encoded = index.toString(36);
  return index < 36 ? encoded : `~${encoded}`;
}

function unminifyKey(key: string): string {
  if (key.length === 1) {
    return configMinifierKeys[parseInt(key, 36)] ?? key;
  }

  if (key.startsWith('______')) {
    return key.slice(3);
  }

  if (key.length === 4 && key.startsWith('___')) {
    return key[3];
  }

  if (key.startsWith('~~')) {
    return key.slice(1);
  }

  if (/^~[0-9a-z]+$/.test(key)) {
    const index = parseInt(key.slice(1), 36);
    return configMinifierKeys[index] ?? key;
  }

  return key;
}

function minifyValue(value: unknown): unknown {
  if (
    typeof value === 'string' &&
    (value.startsWith('___') || value.startsWith('@') || value.startsWith('~'))
  ) {
    return '___' + value;
  }

  if (typeof value === 'string' && value.length === 1) {
    return '___' + value;
  }

  const index = indexOfValue(value);
  if (index === -1) {
    return value;
  }
  return index < 36 ? index.toString(36) : '@' + index.toString(36);
}

function unminifyValue(value: unknown): unknown {
  if (
    typeof value === 'string' &&
    (value.startsWith('@') || value.startsWith('~'))
  ) {
    const idx = parseInt(value.slice(1), 36);
    if (!Number.isNaN(idx) && idx >= 0 && idx < configMinifierValues.length) {
      return configMinifierValues[idx];
    }
  }

  if (typeof value === 'string' && value.length === 1) {
    return configMinifierValues[parseInt(value, 36)] ?? value;
  }

  if (typeof value === 'string' && value.startsWith('______')) {
    return value.slice(3);
  }

  if (
    typeof value === 'string' &&
    (value.startsWith('___@') || value.startsWith('___~'))
  ) {
    return value.slice(3);
  }

  if (
    typeof value === 'string' &&
    value.length === 4 &&
    value.startsWith('___')
  ) {
    return value[3];
  }

  return value;
}

function indexOfKey(key: string): number {
  for (let i = 0; i < configMinifierKeys.length; i++) {
    if (configMinifierKeys[i] === key) {
      return i;
    }
  }
  return -1;
}

function indexOfValue(value: unknown): number {
  for (let i = 0; i < configMinifierValues.length; i++) {
    if (configMinifierValues[i] === value) {
      return i;
    }
  }
  return -1;
}
