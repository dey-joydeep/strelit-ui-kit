/**
 * Minifies and unminifies configs by replacing frequent keys
 * and values with one letter substitutes. Config options must
 * retain array position/index, add new options at the end.
 * @internal
 */

const configMinifierKeys: readonly string[] = [
    'settings',
    'hasHeaders',
    'constrainDragToContainer',
    'selectionEnabled',
    'dimensions',
    'borderWidth',
    'minItemHeight',
    'minItemWidth',
    'headerHeight',
    'dragProxyWidth',
    'dragProxyHeight',
    'labels',
    'close',
    'maximise',
    'minimise',
    'popout',
    'content',
    'componentType',
    'componentState',
    'id',
    'width',
    'type',
    'height',
    'isClosable',
    'title',
    'popoutWholeStack',
    'openPopouts',
    'parentId',
    'activeItemIndex',
    'reorderEnabled',
    'borderGrabWidth',

    // Maximum 36 entries, do not cross this line!
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
    if (configMinifierKeys.length > 36) {
        throw new Error('Too many keys in config minifier map');
    }
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
            to[translatedKey] = translateValue(fromValue, minify);
        }
    }

    return to;
}

function translateArray(from: unknown[], minify: boolean): unknown[] {
    const length = from.length;
    const to = new Array<unknown>(length);
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
    if (value.length === 1) {
        return '___' + value;
    }

    const index = indexOfKey(value);
    return index === -1 ? value : index.toString(36);
}

function unminifyKey(key: string): string {
    if (key.length === 1) {
        return configMinifierKeys[parseInt(key, 36)];
    }

    if (key.length === 4 && key.startsWith('___')) {
        return key[3];
    }

    return key;
}

function minifyValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length === 1) {
        return '___' + value;
    }

    const index = indexOfValue(value);
    return index === -1 ? value : index.toString(36);
}

function unminifyValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length === 1) {
        return configMinifierValues[parseInt(value, 36)];
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
