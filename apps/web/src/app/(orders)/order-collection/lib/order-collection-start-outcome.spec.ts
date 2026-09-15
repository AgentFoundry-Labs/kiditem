import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { OrderCollectionExtensionUnavailableError } from './order-collection-extension';
import { ORDER_COLLECTION_IN_PROGRESS_MESSAGE } from './order-collection-source-owner';
import {
  classifyOrderCollectionStart,
  isOrderCollectionInProgress,
  OrderCollectionAlreadyRunningError,
} from './order-collection-start-outcome';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

describe('classifyOrderCollectionStart', () => {
  /** KID-106 Q6: 같은 몰이 이미 수집 중이면 두 번째 시도를 열지 않고 진행 중인 수집을 보여 준다. */
  it("⭐ reads the owner's 409 as the mall's running collection, not a failed start", () => {
    const refused = new ApiError(409, 'HTTP_409', ORDER_COLLECTION_IN_PROGRESS_MESSAGE, {
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: ATTEMPT_ID,
    });

    expect(classifyOrderCollectionStart(refused, '키드키즈')).toEqual({
      outcome: 'in_progress',
      attemptId: ATTEMPT_ID,
      message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
    });
    expect(isOrderCollectionInProgress(refused)).toBe(true);
  });

  it('reads this screen\'s own start that is still in flight as the same running collection', () => {
    const inFlight = new OrderCollectionAlreadyRunningError();

    expect(classifyOrderCollectionStart(inFlight, '키드키즈')).toEqual({
      outcome: 'in_progress',
      attemptId: null,
      message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
    });
    expect(isOrderCollectionInProgress(inFlight)).toBe(true);
  });

  it('keeps an unusable extension apart from a failed start, so the operator fixes the extension', () => {
    const unavailable = new OrderCollectionExtensionUnavailableError(
      '주문수집 확장프로그램을 찾지 못했습니다.',
    );

    expect(classifyOrderCollectionStart(unavailable, '키드키즈')).toEqual({
      outcome: 'extension_unavailable',
      message: '주문수집 확장프로그램을 찾지 못했습니다.',
    });
    expect(isOrderCollectionInProgress(unavailable)).toBe(false);
  });

  it('reports every other failure as a failed start with the mall named', () => {
    expect(classifyOrderCollectionStart(new Error('Failed to fetch'), '키드키즈')).toEqual({
      outcome: 'start_failed',
      message: '키드키즈 연결이 끊겼습니다. 로그인 상태(또는 네트워크)를 확인한 뒤 다시 수집해주세요.',
    });
    expect(classifyOrderCollectionStart(new ApiError(500, 'HTTP_500', '서버 오류'), '온채널')).toEqual({
      outcome: 'start_failed',
      message: '서버 오류',
    });
  });

  it('does not read another conflict as a running collection', () => {
    const reused = new ApiError(409, 'HTTP_409', 'SOURCE_IDEMPOTENCY_KEY_REUSED');

    expect(isOrderCollectionInProgress(reused)).toBe(false);
    expect(classifyOrderCollectionStart(reused, '키드키즈').outcome).toBe('start_failed');
  });
});
