import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { getMallPublishAdapter } from './adapters';
import { executeTargetRegistration } from './target-registration-execution';
import { listRegistrationTargetExecutions } from './registration-execution-api';
import { useMallPublishRun, type PublishTask } from './use-mall-publish-run';
import type { MallPublishAdapter, MallPublishItem } from './mall-publish-adapter';
import { REGISTRATION_ALREADY_REGISTERED_CODE, type TargetExecutionResult } from '@kiditem/shared/sales-product';
import { ApiError } from '@/lib/api-error';

const mocks = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  execute: vi.fn(),
  history: vi.fn(),
  resolve: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./adapters', () => ({ getMallPublishAdapter: mocks.getAdapter }));
vi.mock('./target-registration-execution', () => ({
  executeTargetRegistration: mocks.execute,
  isActiveTargetExecution: (execution: { status: string }) => ['prepared', 'executing', 'reconciling'].includes(execution.status),
}));
vi.mock('./registration-execution-api', () => ({
  listRegistrationTargetExecutions: mocks.history,
}));
vi.mock('@/lib/registration-target-api', () => ({ registrationTargetApi: { resolve: mocks.resolve, update: mocks.update } }));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

const adapter: MallPublishAdapter = {
  mallKey: 'kidsnote', mallName: '키즈노트', mode: 'form', batchSize: 1,
  requiresOperatorSubmit: true, fields: [{ key: 'returnFee', label: '반품비', origin: 'template', control: 'text', defaultValue: '3000', required: false }],
  preview: () => [], validate: () => [], send: vi.fn(async () => ({ ok: true, confirmed: false, manualSteps: [], warnings: [] })),
};

const target = {
  id: TARGET_ID, salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID, version: 4,
} as unknown as Awaited<ReturnType<typeof registrationTargetApi.resolve>>;

function item(source: MallPublishItem['source'] = 'sales_product'): MallPublishItem {
  return {
    candidateId: source === 'candidate' ? 'candidate-id' : PRODUCT_ID,
    name: '상품', salePrice: 5000, thumbnailUrl: null, source,
    // 수집 시점부터 초안이 있다(ADR-0022) — 후보 항목도 이미 자기 판매상품 id를 안다.
    ...(source === 'candidate' ? { salesProductId: PRODUCT_ID } : {}),
  };
}

function task(overrides: Partial<PublishTask> = {}): PublishTask {
  return {
    id: 'kidsnote#0', mallKey: 'kidsnote', mallName: '키즈노트', channelAccountId: ACCOUNT_ID,
    items: [item()], values: { returnFee: '3000' }, adapterValues: { returnFee: '3000' },
    status: 'pending', outcome: null, error: null, ...overrides,
  };
}

describe('useMallPublishRun target execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdapter.mockReturnValue(adapter);
    mocks.resolve.mockResolvedValue(target);
    mocks.history.mockResolvedValue([]);
    mocks.execute.mockResolvedValue({
      execution: { status: 'reconciling' },
      outcome: { ok: true, submitted: true, confirmed: false, manualSteps: ['몰 결과 확인'], warnings: [] },
      adapterCalled: true,
    });
  });

  it('resolves by the exact account and passes only edited wizard values to the fenced helper', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(mocks.resolve).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID });
    expect(mocks.history).toHaveBeenCalledWith(TARGET_ID);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      targetId: TARGET_ID, expectedVersion: 4, channelAccountId: ACCOUNT_ID, mallKey: 'kidsnote',
      adapterValues: { returnFee: '3000' }, adapter,
    }));
    expect(adapter.send).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.tasks[0]?.status).toBe('reconciling'));
  });

  it('reuses an active execution history row and leaves resend fencing to the shared helper', async () => {
    const active = { executionId: 'active', status: 'reconciling', providerOutcome: 'uncertain' } as TargetExecutionResult;
    mocks.history.mockResolvedValue([active]);
    mocks.execute.mockResolvedValue({
      execution: active,
      outcome: { ok: false, confirmed: false, manualSteps: ['결과 확인'], warnings: [] },
      adapterCalled: false,
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ existingExecution: active }));
    expect(adapter.send).not.toHaveBeenCalled();
    expect(result.current.tasks[0]?.status).toBe('reconciling');
  });

  it('resolves a candidate item by the salesProductId it already carries, with no separate creation step', async () => {
    // 수집 시점부터 초안이 있다(ADR-0022) — 후보 출처 항목도 만들지 않고 곧장 연다.
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => {
      await result.current.start([task({ items: [item('candidate')] })]);
    });

    expect(mocks.resolve).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID });
  });

  it('fails a candidate item with no linked sales-product draft instead of resolving', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => {
      await result.current.start([task({
        items: [{ candidateId: 'candidate-id', name: '상품', salePrice: 5000, thumbnailUrl: null, source: 'candidate', salesProductId: null }],
      })]);
    });

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('판매상품 초안') });
  });

  it('keeps the fence refusal code on a failed task so a screen can say the account is already registered', async () => {
    mocks.execute.mockRejectedValue(new ApiError(409, 'Conflict', '이미 이 몰 계정에 등록된 상품입니다(몰 상품 kk-9).', {
      code: REGISTRATION_ALREADY_REGISTERED_CODE,
    }));
    const { result } = renderHook(() => useMallPublishRun());

    let finished: PublishTask[] = [];
    await act(async () => { finished = await result.current.start([task()]); });

    expect(finished[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('kk-9'),
      errorCode: REGISTRATION_ALREADY_REGISTERED_CODE,
    });
  });

  it('stops before target creation when the selected mall has no exact account ID', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task({ channelAccountId: null })]); });

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('계정 식별자') });
  });
});

describe('useMallPublishRun adapter values on the registration target', () => {
  const savedTarget = {
    id: TARGET_ID, salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID, version: 4,
    registrationInput: { mallCategory: null, mallFields: { returnFee: '3000' }, adapter: { kidsnote: { keep: 'me' }, other: { x: 1 } } },
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    selectedOptions: [{ salesProductOptionId: '77777777-7777-4777-8777-777777777777' }],
  } as unknown as Awaited<ReturnType<typeof registrationTargetApi.resolve>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue(savedTarget);
    mocks.update.mockResolvedValue({ ...savedTarget, version: 5 });
    mocks.history.mockResolvedValue([]);
    mocks.execute.mockResolvedValue({
      execution: { status: 'succeeded' },
      outcome: { ok: true, submitted: true, confirmed: false, manualSteps: [], warnings: [] },
      adapterCalled: true,
    });
  });

  it('stores the adapter’s mall values on the target before the fenced run and executes the saved version', async () => {
    mocks.getAdapter.mockReturnValue({ ...adapter, adapterTargetInput: (values: Record<string, string>) => ({ category: values.category }) });
    const { result } = renderHook(() => useMallPublishRun());

    let finished: Awaited<ReturnType<typeof result.current.start>> = [];
    await act(async () => { finished = await result.current.start([task({ values: { category: 'toy' } })]); });

    expect(mocks.update).toHaveBeenCalledWith(TARGET_ID, {
      expectedVersion: 4,
      registrationInput: {
        mallCategory: null,
        mallFields: { returnFee: '3000' },
        adapter: { kidsnote: { keep: 'me', category: 'toy' }, other: { x: 1 } },
      },
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: '77777777-7777-4777-8777-777777777777' }],
    });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ targetId: TARGET_ID, expectedVersion: 5 }));
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]!);
    expect(finished[0]).toMatchObject({ mallKey: 'kidsnote', status: 'succeeded' });
  });

  it('leaves the target alone when the adapter has nothing to store', async () => {
    mocks.getAdapter.mockReturnValue({ ...adapter, adapterTargetInput: () => null });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 4 }));
  });

  it('lets the adapter say a provider rejection in the operator’s words', async () => {
    mocks.getAdapter.mockReturnValue({ ...adapter, describeError: (message: string) => `번역: ${message}` });
    mocks.execute.mockRejectedValue(new Error('A registration registers exactly one option.'));
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: '번역: A registration registers exactly one option.' });
  });
});

describe('useMallPublishRun sheet delivery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a `sheet` mall file for the whole task without opening a registration execution', async () => {
    const send = vi.fn(async () => ({ ok: true, confirmed: false, manualSteps: ['양식을 올리세요'], warnings: [] }));
    mocks.getAdapter.mockReturnValue({ ...adapter, mallKey: 'sheet-mall', mode: 'sheet', batchSize: Number.POSITIVE_INFINITY, send });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => {
      await result.current.start([task({ mallKey: 'sheet-mall', items: [item(), item()] })]);
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.tasks[0]?.status).toBe('succeeded'));
  });
});
