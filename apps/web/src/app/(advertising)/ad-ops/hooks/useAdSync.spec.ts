import { describe, expect, it } from 'vitest';
import { adSyncSucceededNotice } from './useAdSync';

describe('adSyncSucceededNotice', () => {
  it('surfaces identity-less raw-only campaigns as a warning', () => {
    expect(
      adSyncSucceededNotice(
        '광고 동기화 완료 · 2개는 식별자 없어 원본만 보존',
      ),
    ).toEqual({
      tone: 'warning',
      message: '광고 동기화 완료 · 2개는 식별자 없어 원본만 보존',
    });
  });

  it('keeps a fully projected sweep as a normal success', () => {
    expect(adSyncSucceededNotice('광고 동기화 완료')).toEqual({
      tone: 'success',
      message: '광고 동기화가 완료되었습니다.',
    });
  });
});
