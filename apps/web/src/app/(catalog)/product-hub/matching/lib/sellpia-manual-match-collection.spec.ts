import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { readSellpiaManualMatchSource } from './channel-sku-matching-api';
import { collectSellpiaManualMatchSnapshot } from './sellpia-manual-match-collection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));
vi.mock('./channel-sku-matching-api', () => ({ readSellpiaManualMatchSource: vi.fn() }));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { organizationId: 'org-1' };
const SNAPSHOT = {
  targetCount: 2,
  matchedTargetCount: 1,
  aliasCount: 3,
  snapshotHash: 'c'.repeat(64),
  capturedAt: '2026-09-26T01:00:00.000Z',
};

function operation(status: 'executing' | 'succeeded' | 'failed' | 'cancelled', patch: Record<string, unknown> = {}) {
  return {
    operation: {
      id: OPERATION_ID,
      kind: 'channels.sellpia_manual_match',
      status,
      lockKeys: [],
      plan: null,
      progress: null,
      result: status === 'succeeded' ? { targets: 2, matched: 1 } : null,
      window: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-09-26T00:59:00.000Z',
      finishedAt: status === 'executing' ? null : '2026-09-26T01:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      attempts: 1,
      maxAttempts: 1,
      scheduledFor: null,
      ...patch,
    },
  };
}

const noSleep = { sleep: async () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
  vi.mocked(readSellpiaManualMatchSource).mockResolvedValue({ latestOperation: null, currentSnapshot: SNAPSHOT });
});

describe('collectSellpiaManualMatchSnapshot', () => {
  it('⭐ 확장에 수동매칭 kind를 시작시키고 그 실행 하나를 끝날 때까지 읽은 뒤 게시된 스냅샷을 돌려준다', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(operation('executing'))
      .mockResolvedValueOnce(operation('succeeded'));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE, noSleep)).resolves.toMatchObject({
      operation: { id: OPERATION_ID, status: 'succeeded' },
      status: SNAPSHOT,
    });
    expect(requestOperationStart).toHaveBeenCalledWith('channels.sellpia_manual_match', {}, { capability: 'channelsOperationKindsV1' });
    expect(vi.mocked(apiClient.get).mock.calls).toEqual([
      [`/api/operations/${OPERATION_ID}`],
      [`/api/operations/${OPERATION_ID}`],
    ]);
  });

  it('실패한 실행은 운영자 문장으로 던지고 스냅샷을 읽지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(operation('failed', {
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '셀피아 로그인이 필요합니다. 열린 수동상품매칭 화면에서 로그인한 뒤 다시 시도해 주세요.',
    }));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE, noSleep)).rejects.toThrow(/셀피아 로그인이 필요합니다/);
    expect(readSellpiaManualMatchSource).not.toHaveBeenCalled();
  });

  it('셀피아 로그인을 쓰는 다른 실행이 돌면 확장의 거절 문장을 그대로 던진다', async () => {
    vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'refused', message: '같은 실행이 이미 진행 중입니다.' });

    await expect(collectSellpiaManualMatchSnapshot(SCOPE, noSleep)).rejects.toThrow('같은 실행이 이미 진행 중입니다.');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('상한 안에 끝나지 않으면 아직 끝나지 않았다고 알린다(실행은 확장에서 계속된다)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(operation('executing'));
    let clock = 0;

    await expect(collectSellpiaManualMatchSnapshot(SCOPE, { sleep: async () => undefined, now: () => (clock += 20 * 60_000) }))
      .rejects.toThrow(/아직 끝나지 않았습니다/);
  });
});
