import { describe, expect, it } from 'vitest';
import { splitStringAtFirstNonNumericChar } from '../../src/ts/utils/utils';

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
