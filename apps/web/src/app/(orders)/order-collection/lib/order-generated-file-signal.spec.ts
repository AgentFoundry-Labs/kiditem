import { describe, expect, it, vi } from 'vitest';
import {
  publishGeneratedOrderFilesChanged,
  subscribeGeneratedOrderFiles,
} from './order-generated-file-store';

/**
 * 수집은 주문수집 화면 밖에서도 돈다(대시보드 버튼 · 자동 운전 고리 · 다른 탭). 파일이 쌓인
 * 것을 화면이 알아야 몰 카드의 '당일 · 신규'가 멈추지 않는다.
 */
describe('수집 파일 변경 알림', () => {
  it('⭐ 저장이 끝났다고 알리면 구독한 화면이 듣는다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGeneratedOrderFiles(listener);

    publishGeneratedOrderFilesChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    publishGeneratedOrderFilesChanged();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    publishGeneratedOrderFilesChanged();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('구독을 풀면 더 듣지 않는다 — 화면을 떠난 뒤 다시 읽지 않게', () => {
    const listener = vi.fn();
    subscribeGeneratedOrderFiles(listener)();
    publishGeneratedOrderFilesChanged();
    expect(listener).not.toHaveBeenCalled();
  });
});
