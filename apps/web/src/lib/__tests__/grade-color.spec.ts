import { describe, expect, it } from 'vitest';
import { getGradeColor, getGradeTextColor } from '../utils';

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

describe('getGradeTextColor', () => {
  it('reuses the grade palette text tone for labels that carry no chip', () => {
    expect(getGradeTextColor('A')).toBe('text-emerald-800');
    expect(getGradeTextColor('B')).toBe('text-amber-800');
    expect(getGradeTextColor('C')).toBe('text-rose-800');
  });

  it('keeps an unclassified or unknown grade on the neutral text tone', () => {
    for (const grade of ['N/A', '-', '']) {
      expect(getGradeTextColor(grade)).toBe('text-slate-700');
    }
  });

  it('stays the text half of the chip tone for every grade', () => {
    for (const grade of ['A', 'B', 'C', 'N/A']) {
      expect(getGradeColor(grade).split(' ')).toContain(getGradeTextColor(grade));
    }
  });
});
