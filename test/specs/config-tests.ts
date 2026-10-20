import { describe, expect, it } from 'vitest';
import { splitStringAtFirstNonNumericChar } from '../../src/ts/utils/utils';
import {
  isResolvedRootItemConfig,
  isResolvedRowOrColumnItemConfigChild,
  resolvedItemConfigDefaults,
} from '../../src/ts/config/resolved-config';
import { ItemType } from '../../src/ts/utils/types';

describe('size token splitting', () => {
  it.each([
    ['', '', ''],
    ['   ', '', ''],
    [' 12.5 px ', '12.5', 'px'],
    ['.5%', '.5', '%'],
    ['1..2fr', '1.', '.2fr'],
    ['12e3px', '12', 'e3px'],
    ['-1px', '', '-1px'],
  ])(
    'splits %j at the first nonnumeric character',
    (input, numeric, suffix) => {
      expect(splitStringAtFirstNonNumericChar(input)).toEqual({
        numericPart: numeric,
        firstNonNumericCharPart: suffix,
      });
    },
  );
});

describe('resolved root item guard', () => {
  it.each([
    [ItemType.row, true],
    [ItemType.column, true],
    [ItemType.stack, true],
    [ItemType.component, true],
    [ItemType.ground, false],
  ])('preserves the shared result for %s', (type, expected) => {
    const config = { ...resolvedItemConfigDefaults, type };
    expect(isResolvedRootItemConfig(config)).toBe(expected);
    expect(isResolvedRowOrColumnItemConfigChild(config)).toBe(expected);
  });

  it('preserves the diagnostic for an unknown type', () => {
    const config = {
      ...resolvedItemConfigDefaults,
      type: 'unknown' as ItemType,
    };
    expect(() => isResolvedRootItemConfig(config)).toThrow('CROCOSPCICIC13687');
  });
});
