import { beforeEach, describe, expect, it } from 'vitest';
import {
  orderCollectionSourceAttemptStorageKey,
  readActiveOrderCollectionAttempt,
  rememberActiveOrderCollectionAttempt,
} from './order-collection-source-owner';

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
});
