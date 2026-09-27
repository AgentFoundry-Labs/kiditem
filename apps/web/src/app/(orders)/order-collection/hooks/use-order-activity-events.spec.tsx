import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOrderActivityEvents } from './use-order-activity-events';

describe('useOrderActivityEvents — 실행 하나의 활동 행만 지우기(KID-380 D7 리뷰 SHOULD 5)', () => {
  beforeEach(() => window.localStorage.clear());

  it('실행 id로 지우면 그 실행의 행만 지우고 같은 몰의 다른 실행 행은 둔다, 실행 id 없이 지우면 그 몰의 조치 행을 다 지운다', () => {
    const { result } = renderHook(() => useOrderActivityEvents([]));
    act(() => {
      result.current.logActivity('error', '키드키즈', '실행이 아직 끝나지 않았습니다.', 'op-old');
      result.current.logActivity('login', '키드키즈', '로그인이 필요합니다.', 'op-new');
    });
    act(() => result.current.clearMallErrorActivity('키드키즈', 'op-old'));
    expect(result.current.events.map((event) => [event.kind, event.runId])).toEqual([['login', 'op-new']]);

    act(() => result.current.clearMallErrorActivity('키드키즈'));
    expect(result.current.events).toEqual([]);
  });

  it('파일 재사용 행은 그 건수를 싣고, 그 몰을 실패 몰로 세지 않는다(실기기 R6)', () => {
    const account = { key: 'haebub-mall', name: '해법몰' } as Parameters<typeof useOrderActivityEvents>[0][number];
    const { result } = renderHook(() => useOrderActivityEvents([account]));
    act(() => result.current.logActivity('error', '해법몰', '실패'));
    act(() => result.current.logReusedFile('해법몰', 1));
    expect(result.current.events[0]).toMatchObject({ kind: 'reused', mallName: '해법몰', orders: 1 });
    expect(result.current.failedMallAccounts).toEqual([]);
  });
});
