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

type TranslationContainer = Record<string, unknown> | unknown[];
type TranslationEnterFrame = {
  kind: 'enter';
  from: TranslationContainer;
  to: TranslationContainer;
  depth: number;
  representationDepth: number;
};
type TranslationIterateFrame = {
  kind: 'iterate';
  from: TranslationContainer;
  to: TranslationContainer;
  depth: number;
  representationDepth: number;
  index: number;
  valueCount: number;
  array: unknown[] | undefined;
  keys: string[] | undefined;
};
type TranslationFrame =
  | TranslationEnterFrame
  | TranslationIterateFrame
  | { kind: 'exit'; from: TranslationContainer };
type TranslationState = {
  stack: TranslationFrame[];
  ancestors: WeakSet<object>;
  nodes: number;
  minify: boolean;
};

export function translateObject(
  from: Record<string, unknown>,
  minify: boolean,
): Record<string, unknown> {
  const to: Record<string, unknown> = {};
  const state: TranslationState = {
    stack: [{ kind: 'enter', from, to, depth: 0, representationDepth: 0 }],
    ancestors: new WeakSet<object>(),
    nodes: 1,
    minify,
  };
  while (state.stack.length > 0) {
    const frame = state.stack.pop();
    if (frame === undefined) {
      break;
    }
    if (frame.kind === 'exit') {
      state.ancestors.delete(frame.from);
    } else if (frame.kind === 'enter') {
      enterTranslationContainer(frame, state);
    } else {
      translateContainerEntry(frame, state);
    }
  }
  return to;
}

function enterTranslationContainer(
  frame: TranslationEnterFrame,
  state: TranslationState,
): void {
  if (
    frame.depth > maximumConfigDepth ||
    frame.representationDepth > maximumTranslationDepth
  ) {
    throwTranslationLimitError();
  }
  if (state.ancestors.has(frame.from)) {
    throw new ConfigurationError(
      'Configuration contains a cyclic object graph',
    );
  }
  state.ancestors.add(frame.from);
  const array = Array.isArray(frame.from) ? frame.from : undefined;
  const keys = array === undefined ? Object.keys(frame.from) : undefined;
  const valueCount = array === undefined ? keys!.length : array.length;
  if (valueCount > maximumConfigNodes - state.nodes) {
    throwTranslationLimitError();
  }
  state.nodes += valueCount;
  state.stack.push({ kind: 'exit', from: frame.from });
  if (valueCount > 0) {
    state.stack.push({
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
}

function translateContainerEntry(
  frame: TranslationIterateFrame,
  state: TranslationState,
): void {
  const { array, keys, index } = frame;
  const key = array === undefined ? keys![index] : index;
  const value =
    array !== undefined
      ? array[index]
      : (frame.from as Record<string, unknown>)[key as string];
  if (index + 1 < frame.valueCount) {
    state.stack.push({ ...frame, index: index + 1 });
  }
  const translatedValue =
    typeof value === 'object' && value !== null
      ? enterTranslationChild(frame, key, value, state)
      : state.minify
        ? minifyValue(value)
        : unminifyValue(value);
  if (Array.isArray(frame.to)) {
    frame.to[index] = translatedValue;
  } else {
    const translatedKey = state.minify
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

function enterTranslationChild(
  frame: TranslationIterateFrame,
  key: string | number,
  value: object,
  state: TranslationState,
): TranslationContainer {
  const childRepresentationDepth = frame.representationDepth + 1;
  const semanticKey =
    frame.array === undefined
      ? state.minify
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
    (Array.isArray(value) && value.length > maximumConfigNodes - state.nodes)
  ) {
    throwTranslationLimitError();
  }
  const childTo: TranslationContainer = Array.isArray(value)
    ? Array<unknown>(value.length)
    : {};
  state.stack.push({
    kind: 'enter',
    from: value as TranslationContainer,
    to: childTo,
    depth: childDepth,
    representationDepth: childRepresentationDepth,
  });
  return childTo;
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
