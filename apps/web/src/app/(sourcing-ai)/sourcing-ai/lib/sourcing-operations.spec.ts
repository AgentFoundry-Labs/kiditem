import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { sourcingOperationCollection, sourcingOperationState } from './sourcing-operations';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const KIND = 'sourcing.live_commerce' as const;

function operation(id: string, status: OperationView['status'], plan: Record<string, unknown> = {}): OperationView {
  return {
    id,
    kind: KIND,
    status,
    lockKeys: ['resource:douyin:abc'],
    plan,
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
}

const ROOM_A = 'https://live.douyin.com/1';
const ROOM_B = 'https://live.douyin.com/2';
const A_RUNNING = '11111111-1111-4111-8111-111111111111';
const A_DONE = '22222222-2222-4222-8222-222222222222';
const B_RUNNING = '33333333-3333-4333-8333-333333333333';

const status: OperationListResponse = {
  operations: [
    operation(B_RUNNING, 'executing', { pageUrl: ROOM_B }),
    operation(A_RUNNING, 'executing', { pageUrl: ROOM_A }),
    operation(A_DONE, 'succeeded', { pageUrl: ROOM_A }),
  ],
};

function roomA() {
  return sourcingOperationCollection<{ url: string }>({
    kind: KIND,
    sourceKey: `${KIND}:${ROOM_A}`,
    label: '라이브 방송 수집',
    match: (op) => op.plan?.pageUrl === ROOM_A,
    scope: ({ url }) => ({ platform: 'douyin', url }),
    onNewComplete: () => undefined,
  });
}

describe('sourcing operation collection (KID-360)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('kiditem-os');
    vi.mocked(transferExtensionAuthTo).mockResolvedValue(undefined as never);
  });

  it('reads the kind from the operations reader and sees only its own target', async () => {
    const adapter = roomA();
    vi.mocked(apiClient.get).mockResolvedValue(status as never);

    const queryFn = adapter.statusQuery.queryFn as (context: never) => Promise<unknown>;
    await expect(queryFn({} as never)).resolves.toEqual(status);
    expect(apiClient.get).toHaveBeenCalledWith('/api/operations?kinds=sourcing.live_commerce&limit=20');
    expect(adapter.readRunning(status)).toEqual({ attemptId: A_RUNNING, scopeLabel: null });
    expect(adapter.readCompleteId(status)).toBe(A_DONE);
    expect(sourcingOperationState(status, (op) => op.plan?.pageUrl === ROOM_B).lastSucceeded).toBeNull();
  });

  it('starts through the extension operation.start with the kind scope and maps a lock conflict to a refusal', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true } }
        : { success: true, operationId: A_RUNNING, reused: false });

    await expect(roomA().start?.({ url: ROOM_A }, { status: undefined })).resolves.toEqual({ outcome: 'started', attemptId: A_RUNNING });
    expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-os',
      { action: 'operation.start', kind: KIND, scope: { platform: 'douyin', url: ROOM_A } },
      60_000,
    );

    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true } }
        : { success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 방송을 이미 수집하고 있습니다.' });
    await expect(roomA().start?.({ url: ROOM_A }, { status: undefined }))
      .resolves.toEqual({ outcome: 'refused', message: '같은 방송을 이미 수집하고 있습니다.' });
  });

  it('asks for an extension update when the runtime is missing, and stops through operation.cancel then the server', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({ success: true, capabilities: {} });
    await expect(roomA().start?.({ url: ROOM_A }, { status: undefined })).rejects.toThrow('확장 프로그램을 업데이트해 주세요.');

    vi.mocked(sendToExtension).mockResolvedValue({ success: true });
    await roomA().cancelInExtension?.(A_RUNNING, { status });
    expect(sendToExtension).toHaveBeenLastCalledWith('kiditem-os', { action: 'operation.cancel', operationId: A_RUNNING });
    await roomA().cancelOnServer?.(A_RUNNING, { status });
    expect(apiClient.post).toHaveBeenCalledWith(`/api/operations/${A_RUNNING}/cancel`);
  });
});
