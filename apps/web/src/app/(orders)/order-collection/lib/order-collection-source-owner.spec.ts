import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';

const mockPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: mockPost },
}));

import {
  beginOrderCollectionSourceAttempt,
  ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
  orderCollectionSourceAttemptStorageKey,
  readActiveOrderCollectionAttempt,
  rememberActiveOrderCollectionAttempt,
} from './order-collection-source-owner';

describe('beginOrderCollectionSourceAttempt', () => {
  /** 서버는 몰마다 진행 중인 시도를 하나만 둔다. 거절을 'Conflict Exception' 그대로 보여 주지 않는다. */
  it('⭐ says the mall still has a collection running instead of a bare conflict', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'Attempt in progress'));

    const started = beginOrderCollectionSourceAttempt('11111111-1111-4111-8111-111111111111', {
      mallKey: 'kidsnote',
      collectionDate: '2026-09-14',
    });

    await expect(started).rejects.toMatchObject({ status: 409, message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE });
  });

  /** 진행 중이라는 사실은 기계가 읽는 자리에 남아야 화면이 실패가 아니라 진행 중으로 보여 준다. */
  it('⭐ keeps the running attempt readable so the screen shows it instead of a failed start', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(409, 'ATTEMPT_IN_PROGRESS', null, {
      attemptId: '22222222-2222-4222-8222-222222222222',
    }));

    await expect(beginOrderCollectionSourceAttempt('11111111-1111-4111-8111-111111111111', {
      mallKey: 'kidsnote',
      collectionDate: '2026-09-14',
    })).rejects.toMatchObject({
      status: 409,
      code: 'ATTEMPT_IN_PROGRESS',
      message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
      details: { attemptId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('passes other conflicts through unchanged', async () => {
    const reused = new ApiError(409, 'HTTP_409', 'SOURCE_IDEMPOTENCY_KEY_REUSED');
    mockPost.mockRejectedValueOnce(reused);

    await expect(beginOrderCollectionSourceAttempt('11111111-1111-4111-8111-111111111111', {
      mallKey: 'kidsnote',
      collectionDate: '2026-09-14',
    })).rejects.toBe(reused);
  });
});

describe('order collection source owner persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps uncertain begin correlation scoped to organization and browser origin', () => {
    const attempt = {
      attemptId: null,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    };

    rememberActiveOrderCollectionAttempt('org-a', attempt, 'https://office.example');

    expect(readActiveOrderCollectionAttempt('org-a', 'https://office.example'))
      .toEqual(attempt);
    expect(readActiveOrderCollectionAttempt('org-b', 'https://office.example'))
      .toBeNull();
    expect(readActiveOrderCollectionAttempt('org-a', 'https://local.example'))
      .toBeNull();
    expect(orderCollectionSourceAttemptStorageKey('org-a', 'https://office.example'))
      .not.toBe(orderCollectionSourceAttemptStorageKey('org-b', 'https://office.example'));
    expect(orderCollectionSourceAttemptStorageKey('org-a', 'https://office.example'))
      .not.toBe(orderCollectionSourceAttemptStorageKey('org-a', 'https://local.example'));
  });

  it("keeps each mall's attempt apart from the latest attempt and from other malls", () => {
    const kidsnote = { attemptId: '22222222-2222-4222-8222-222222222222', idempotencyKey: null, mallKey: 'kidsnote' };
    const onch = { attemptId: '33333333-3333-4333-8333-333333333333', idempotencyKey: null, mallKey: 'onch' };

    rememberActiveOrderCollectionAttempt('org-a', kidsnote, 'https://office.example', 'kidsnote');
    rememberActiveOrderCollectionAttempt('org-a', onch, 'https://office.example', 'onch');
    rememberActiveOrderCollectionAttempt('org-a', onch, 'https://office.example');

    expect(readActiveOrderCollectionAttempt('org-a', 'https://office.example', 'kidsnote')).toEqual(kidsnote);
    expect(readActiveOrderCollectionAttempt('org-a', 'https://office.example', 'onch')).toEqual(onch);
    expect(readActiveOrderCollectionAttempt('org-a', 'https://office.example')).toEqual(onch);
  });
});
