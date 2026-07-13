import { afterEach, beforeEach, vi } from 'vitest';

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

class PointerEventMock extends MouseEvent {
    readonly isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.isPrimary = init.isPrimary ?? false;
        Object.defineProperty(this, 'pageX', {
            value: init.clientX ?? 0,
            configurable: true,
        });
        Object.defineProperty(this, 'pageY', {
            value: init.clientY ?? 0,
            configurable: true,
        });
    }
}

function getDimensionFromStyle(
    element: HTMLElement,
    property: 'width' | 'height',
): number {
    const value = globalThis.getComputedStyle(element)[property];
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
        return parsed;
    }

    if (element === document.body || element === document.documentElement) {
        return property === 'width' ? 1280 : 720;
    }

    if (
        element.classList.contains('strelit_layout') ||
        element.id === 'layoutContainer'
    ) {
        return property === 'width' ? 960 : 640;
    }

    return property === 'width' ? 320 : 240;
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    configurable: true,
});

Object.defineProperty(globalThis, 'PointerEvent', {
    value: PointerEventMock,
    configurable: true,
});

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    get() {
        return getDimensionFromStyle(this, 'width');
    },
    configurable: true,
});

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    get() {
        return getDimensionFromStyle(this, 'height');
    },
    configurable: true,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    get() {
        return getDimensionFromStyle(this, 'width');
    },
    configurable: true,
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    get() {
        return getDimensionFromStyle(this, 'height');
    },
    configurable: true,
});

HTMLElement.prototype.getBoundingClientRect =
    function getBoundingClientRect(): DOMRect {
        const width = getDimensionFromStyle(this, 'width');
        const height = getDimensionFromStyle(this, 'height');
        return DOMRect.fromRect({ x: 0, y: 0, width, height });
    };

HTMLElement.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.width = '1280px';
    document.documentElement.style.height = '720px';
    document.body.style.width = '1280px';
    document.body.style.height = '720px';
    document.body.style.margin = '0';
});

afterEach(() => {
    document.body.innerHTML = '';
});
