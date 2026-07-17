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
});
