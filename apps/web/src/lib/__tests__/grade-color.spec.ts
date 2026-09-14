import { describe, expect, it } from 'vitest';
import { getGradeColor } from '../utils';

describe('getGradeColor', () => {
  it('colours finance and review grade chips with the product ABC badge palette', () => {
    expect(getGradeColor('A').split(' ')).toEqual(
      expect.arrayContaining(['bg-emerald-100', 'text-emerald-800']),
    );
    expect(getGradeColor('B').split(' ')).toEqual(
      expect.arrayContaining(['bg-amber-100', 'text-amber-800']),
    );
    expect(getGradeColor('C').split(' ')).toEqual(
      expect.arrayContaining(['bg-rose-100', 'text-rose-800']),
    );
  });

  it('keeps an unclassified or unknown grade on the badge neutral tone', () => {
    for (const grade of ['N/A', '-', '']) {
      expect(getGradeColor(grade).split(' ')).toEqual(
        expect.arrayContaining(['bg-slate-100', 'text-slate-700']),
      );
    }
  });
});
