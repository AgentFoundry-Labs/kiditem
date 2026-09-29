import { describe, expect, it } from 'vitest';
import { mallAccountKeyFor } from './mall-account-settings-link';

describe('mallAccountKeyFor', () => {
  it('쿠팡 로켓 줄은 로켓 행을 함께 쓰는 쿠팡직배송 계정으로 보낸다(ADR-0012)', () => {
    expect(mallAccountKeyFor('rocket')).toBe('coupang-direct');
  });

  it('제 계정 행이 있는 몰과 마켓은 제 키 그대로다', () => {
    expect(mallAccountKeyFor('kidsnote')).toBe('kidsnote');
    expect(mallAccountKeyFor('coupang')).toBe('coupang');
    expect(mallAccountKeyFor('coupang-direct')).toBe('coupang-direct');
  });
});
