import { describe, expect, it } from 'vitest';
import { isSerializableObject, isSerializableValue } from '../../src';

describe('serializable value guards', () => {
  it('accepts nested serializable values and repeated references', () => {
    const shared = { enabled: true };
    const value = {
      name: 'panel',
      sizes: [1, 2],
      first: shared,
      second: shared,
    };

    expect(isSerializableValue(value)).toBe(true);
    expect(isSerializableObject(value)).toBe(true);

    let deepDag: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 35; i++) {
      deepDag = { left: deepDag, right: deepDag };
    }
    expect(isSerializableValue(deepDag)).toBe(true);
  });

  it('rejects unsupported primitives, non-finite numbers, and cycles', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(isSerializableValue(undefined)).toBe(false);
    expect(isSerializableValue(Number.NaN)).toBe(false);
    expect(isSerializableValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSerializableValue(() => undefined)).toBe(false);
    expect(isSerializableValue(Symbol('state'))).toBe(false);
    expect(isSerializableValue(cyclic)).toBe(false);
  });

  it('rejects non-plain objects that would lose state when cloned', () => {
    class ComponentState {
      enabled = true;
    }

    expect(isSerializableValue(new Map())).toBe(false);
    expect(isSerializableValue(new Set())).toBe(false);
    expect(isSerializableValue(new Date())).toBe(false);
    expect(isSerializableValue(new ComponentState())).toBe(false);

    const nullPrototype = Object.assign(Object.create(null) as object, {
      enabled: true,
    });
    expect(isSerializableValue(nullPrototype)).toBe(true);
  });

  it('returns false instead of overflowing on excessive input', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 130; index++) {
      deep = { next: deep };
    }
    const broad = Array.from({ length: 10_001 }, () => null);

    expect(isSerializableValue(deep)).toBe(false);
    expect(isSerializableValue(broad)).toBe(false);
  });
});
