import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_APPROVAL_WINDOW_MS,
  ownerInvocationKey,
  requiresUserApproval,
} from './capability-invocation.policy';

describe('capability invocation policy', () => {
  it('requires an explicit user decision only for medium and high risk mutations', () => {
    expect(requiresUserApproval('none')).toBe(false);
    expect(requiresUserApproval('low')).toBe(false);
    expect(requiresUserApproval('medium')).toBe(true);
    expect(requiresUserApproval('high')).toBe(true);
  });

  it('derives the opaque owner key solely from the invocation id', () => {
    expect(ownerInvocationKey('00000000-0000-4000-8000-000000000001')).toBe(
      'capability-invocation:00000000-0000-4000-8000-000000000001',
    );
  });

  it('keeps the approval window code-owned and fixed at thirty minutes', () => {
    expect(CAPABILITY_APPROVAL_WINDOW_MS).toBe(30 * 60 * 1_000);
  });
});
