/**
 * Minifies and unminifies configs by replacing frequent keys
 * and values with compact base-36 substitutes. Config options must
 * retain array position/index, add new options at the end.
 * @internal
 */

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
  const to: Record<string, unknown> = {};
  for (const key in from) {
    if (Object.prototype.hasOwnProperty.call(from, key)) {
      const translatedKey = minify ? minifyKey(key) : unminifyKey(key);
      const fromValue = from[key];
      Object.defineProperty(to, translatedKey, {
        configurable: true,
        enumerable: true,
        value: translateValue(fromValue, minify),
        writable: true,
      });
    }
  }

  return to;
}

function translateArray(from: unknown[], minify: boolean): unknown[] {
  const length = from.length;
  const to = Array<unknown>(length);
  for (let i = 0; i < length; i++) {
    to[i] = translateValue(from[i], minify);
  }
  return to;
}

function translateValue(from: unknown, minify: boolean): unknown {
  if (typeof from === 'object') {
    if (from === null) {
      return null;
    } else if (Array.isArray(from)) {
      return translateArray(from, minify);
    } else {
      return translateObject(from as Record<string, unknown>, minify);
    }
  } else {
    return minify ? minifyValue(from) : unminifyValue(from);
  }
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
    return configMinifierKeys[parseInt(key, 36)];
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
    return configMinifierValues[parseInt(value, 36)];
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
