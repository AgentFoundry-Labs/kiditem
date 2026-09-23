import { describe, expect, it } from 'vitest';
import { MallListingStateSchema } from './mall-publishing.js';

describe('MallListingStateSchema', () => {
  // 준비 · 전송 · 확인은 등록 상태 reader 의 계정별 상태가 말한다(KID-320) — 리스팅 칸 상태에는 없다.
  it('folds only listing facts and has no preparation state', () => {
    expect(MallListingStateSchema.options).not.toContain('preparing');
    expect(MallListingStateSchema.safeParse('preparing').success).toBe(false);
    expect(MallListingStateSchema.safeParse('published').success).toBe(true);
  });
});
