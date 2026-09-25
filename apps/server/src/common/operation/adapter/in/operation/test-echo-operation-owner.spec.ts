import { describe, expect, it } from 'vitest';
import { TestEchoOperationOwner, testOperationKindsEnabled } from './test-echo-operation-owner';

describe('test.echo owner (KID-357 확장 런타임 스모크)', () => {
  it('KIDITEM_TEST_OPERATION_KINDS=1 일 때만 켜진다', () => {
    expect(testOperationKindsEnabled({})).toBe(false);
    expect(testOperationKindsEnabled({ KIDITEM_TEST_OPERATION_KINDS: 'true' })).toBe(false);
    expect(testOperationKindsEnabled({ KIDITEM_TEST_OPERATION_KINDS: '1' })).toBe(true);
  });

  it('plan 은 scope 의 lockKeys 를 그대로 잠그고 기본은 org 다', async () => {
    const owner = new TestEchoOperationOwner();
    await expect(owner.plan({}, { organizationId: 'o', userId: null })).resolves.toEqual({ lockKeys: ['org'], plan: { echo: true, lockKeys: ['org'] } });
    await expect(owner.plan({ lockKeys: ['resource:echo:a'] }, { organizationId: 'o', userId: null })).resolves.toMatchObject({ lockKeys: ['resource:echo:a'] });
    await expect(owner.plan({ lockKeys: ['bogus'] }, { organizationId: 'o', userId: null })).rejects.toThrow();
  });

  it('finalize 는 원장을 쓰지 않고 청크·항목 수만 돌려준다', async () => {
    const owner = new TestEchoOperationOwner();
    await expect(owner.finalize([
      { chunkKind: 'echo', sequence: 1, itemCount: 2, payload: [1, 2] },
      { chunkKind: 'echo', sequence: 2, itemCount: 1, payload: [3] },
    ], null, { tx: {} as never, organizationId: 'o', operationId: 'op', plan: {}, attempts: 1, maxAttempts: 1 })).resolves.toEqual({ result: { chunks: 2, items: 3 } });
  });
});
