import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { OperationView } from '@kiditem/shared/operation';
import { startCollectionSource } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { sellpiaOperation } from '@/test/fixtures/sellpia-operations';
import { collectSellpiaInventoryBeforeCalculation } from './collect-sellpia-before-calculation';

vi.mock('@/hooks/use-collection-source-control', async (original) => ({
  ...await original<typeof import('@/hooks/use-collection-source-control')>(),
  startCollectionSource: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

// 계산 전 재고 수집(KID-361 J1): 공용 시작 한 번 → 그 실행 하나(GET /api/operations/:id)를 발행이 끝날 때까지 본다.
const ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_PATH = `/api/operations/${ID}`;
const noSleep = { sleep: async () => undefined };

let reads: OperationView[];
let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  reads = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'started', attemptId: ID });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === OPERATION_PATH) return { operation: reads.length > 1 ? reads.shift() : reads[0] };
    if (path === '/api/operations?kinds=products.sellpia_inventory&limit=20') return { operations: [sellpiaOperation()] };
    throw new Error(`unexpected GET ${path}`);
  });
});
afterEach(() => client.clear());

describe('collect before calculation', () => {
  it('시작한 실행이 발행을 끝낼 때까지 그 실행만 읽고 실행 id를 돌려준다', async () => {
    reads = [sellpiaOperation(), sellpiaOperation({ status: 'succeeded', finishedAt: '2026-09-26T01:01:00.000Z' })];
    await expect(collectSellpiaInventoryBeforeCalculation(client, 'org-1', undefined, noSleep)).resolves.toBe(ID);
    expect(vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === OPERATION_PATH)).toHaveLength(2);
  });

  it('이미 도는 실행에 합류하고, 그 실행이 실패하면 운영자 문장으로 거절한다(새로 시작하지 않는다)', async () => {
    vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'running', attemptId: ID });
    reads = [sellpiaOperation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' })];
    await expect(collectSellpiaInventoryBeforeCalculation(client, 'org-1', undefined, noSleep)).rejects.toThrow('셀피아 로그인이 필요합니다.');
    expect(startCollectionSource).toHaveBeenCalledTimes(1);
  });

  it('같은 화면의 다른 시작이 먼저 돌면 실행 reader에서 도는 실행 id를 찾아 기다린다', async () => {
    vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'running', attemptId: null });
    reads = [sellpiaOperation({ status: 'succeeded' })];
    await expect(collectSellpiaInventoryBeforeCalculation(client, 'org-1', undefined, noSleep)).resolves.toBe(ID);
  });

  it('다른 셀피아 실행이 로그인을 쥐어 거절되면 그 문장으로 멈춘다', async () => {
    vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'refused', message: '같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.' });
    await expect(collectSellpiaInventoryBeforeCalculation(client, 'org-1')).rejects.toThrow('같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('화면을 떠나면 기다리기만 멈추고 공용 수집은 멈추지 않는다', async () => {
    reads = [sellpiaOperation()];
    const controller = new AbortController();
    const result = collectSellpiaInventoryBeforeCalculation(client, 'org-1', controller.signal, {
      sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
    });
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    controller.abort(new Error('navigation'));
    await expect(result).rejects.toThrow('navigation');
    expect(startCollectionSource).toHaveBeenCalledTimes(1);
  });
});
