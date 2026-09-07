import { describe, expect, it } from 'vitest';
import { missingNoticeFields } from './product-notice-fields';

describe('missingNoticeFields', () => {
  it('names the fields a 어린이제품 listing still needs', () => {
    expect(missingNoticeFields('어린이제품', { 제조자: '한국완구', 제조국: '대한민국' }))
      .toEqual(['사용연령', '크기', '색상', 'KC인증필유무', 'AS책임자']);
  });

  it('treats a whitespace-only value as unfilled', () => {
    expect(missingNoticeFields('기타재화', {
      품명및모델명: 'A-1', 제조국: '대한민국', 제조자: '한국완구', AS책임자: '   ',
    })).toEqual(['AS책임자']);
  });

  it('does not judge a category it does not know', () => {
    expect(missingNoticeFields('알수없는카테고리', {})).toEqual([]);
    expect(missingNoticeFields(null, null)).toEqual([]);
  });
});
