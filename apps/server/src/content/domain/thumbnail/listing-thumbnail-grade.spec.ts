import { describe, expect, it } from 'vitest';
import { gradeForScore, needsEvaluation } from './listing-thumbnail-grade';

describe('listing thumbnail grade', () => {
  it('점수 경계가 등급을 가른다', () => {
    expect(gradeForScore(95)).toBe('S');
    expect(gradeForScore(90)).toBe('S');
    expect(gradeForScore(89)).toBe('A');
    expect(gradeForScore(70)).toBe('B');
    expect(gradeForScore(60)).toBe('C');
    expect(gradeForScore(50)).toBe('D');
    expect(gradeForScore(49)).toBe('F');
    expect(gradeForScore(Number.NaN)).toBe('F');
  });

  it('몰의 현재 이미지에 평가가 없을 때만 평가 대상이다', () => {
    expect(needsEvaluation({ currentImageUrl: 'https://m/a.jpg', evaluatedImageUrls: [] })).toBe(true);
    expect(needsEvaluation({ currentImageUrl: 'https://m/a.jpg', evaluatedImageUrls: ['https://m/a.jpg'] })).toBe(false);
    expect(needsEvaluation({ currentImageUrl: 'https://m/b.jpg', evaluatedImageUrls: ['https://m/a.jpg'] })).toBe(true);
    expect(needsEvaluation({ currentImageUrl: null, evaluatedImageUrls: [] })).toBe(false);
  });
});
