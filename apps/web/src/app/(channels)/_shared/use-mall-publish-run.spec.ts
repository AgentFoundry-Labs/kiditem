import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { getMallPublishAdapter } from './adapters';
import { useMallPublishRun, type PublishTask } from './use-mall-publish-run';
import type { MallPublishAdapter, MallPublishItem } from './mall-publish-adapter';
import { REGISTRATION_ALREADY_REGISTERED_CODE } from '@kiditem/shared/sales-product';
import { OperationStartFailure } from '@/lib/operation-start';

const mocks = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  execute: vi.fn(),
  resolve: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./adapters', () => ({ getMallPublishAdapter: mocks.getAdapter }));
vi.mock('./target-registration-execution', () => ({ executeTargetRegistration: mocks.execute }));
vi.mock('@/lib/registration-target-api', () => ({ registrationTargetApi: { resolve: mocks.resolve, update: mocks.update } }));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

const adapter: MallPublishAdapter = {
  mallKey: 'kidsnote', mallName: '키즈노트', mode: 'form', batchSize: 1,
  requiresOperatorSubmit: true, fields: [{ key: 'returnFee', label: '반품비', origin: 'template', control: 'text', defaultValue: '3000', required: false }],
  preview: () => [], validate: () => [], buildForm: vi.fn(async () => ({ url: 'https://kidsnote.example/new', manualSteps: [] })),
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
    mocks.execute.mockResolvedValue({
      operation: { state: 'needs_confirmation', label: '확인 필요' },
      outcome: { ok: false, submitted: true, confirmed: false, manualSteps: ['몰 결과 확인'], warnings: [] },
      started: true,
    });
  });

  it('resolves by the exact account and passes only edited wizard values to the registration run', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(mocks.resolve).toHaveBeenCalledWith({ salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      target, mallKey: 'kidsnote', adapterValues: { returnFee: '3000' }, adapter, item: item(),
    }));
    await waitFor(() => expect(result.current.tasks[0]).toMatchObject({
      status: 'reconciling', operations: [{ state: 'needs_confirmation' }],
    }));
  });

  it('a run that met an existing operation shows it without failing the task', async () => {
    mocks.execute.mockResolvedValue({
      operation: { state: 'running', label: '진행 중' },
      outcome: { ok: false, confirmed: false, manualSteps: [], warnings: ['같은 대상의 다른 실행이 진행 중입니다.'] },
      started: false,
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

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

  it('keeps the start refusal code on a failed task so a screen can say the account is already registered', async () => {
    mocks.execute.mockRejectedValue(new OperationStartFailure('이미 이 몰 계정에 등록된 상품입니다(몰 상품 kk-9).', REGISTRATION_ALREADY_REGISTERED_CODE));
    const { result } = renderHook(() => useMallPublishRun());

    let finished: PublishTask[] = [];
    await act(async () => { finished = await result.current.start([task()]); });

    expect(finished[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('kk-9'),
      errorCode: REGISTRATION_ALREADY_REGISTERED_CODE,
    });
  });

  it('⭐ 시작 전에 막힌 실행(폼을 못 만듦)의 까닭을 작업 줄의 오류로 올린다 — "실패"만 보이지 않게(QA D3)', async () => {
    mocks.execute.mockResolvedValue({
      operation: null,
      started: false,
      outcome: { ok: false, confirmed: false, submitted: false, manualSteps: [], warnings: [], error: '상세 이미지가 없습니다. 판매상품 상세에 이미지를 넣으세요.' },
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: '상세 이미지가 없습니다. 판매상품 상세에 이미지를 넣으세요.' });
  });

  it('영어 까닭은 원문 대신 운영자 문장으로', async () => {
    mocks.execute.mockResolvedValue({
      operation: null,
      started: false,
      outcome: { ok: false, confirmed: false, submitted: false, manualSteps: [], warnings: [], error: 'Cannot read properties of undefined' },
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(result.current.tasks[0]?.status).toBe('failed');
    expect(result.current.tasks[0]?.error).not.toContain('Cannot read');
    expect(result.current.tasks[0]?.error).toBeTruthy();
  });

  it('stops before target creation when the selected mall has no exact account ID', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task({ channelAccountId: null })]); });

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
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
    mocks.execute.mockResolvedValue({
      operation: { state: 'confirmed', label: '확인 완료' },
      outcome: { ok: true, submitted: true, confirmed: true, manualSteps: [], warnings: [] },
      started: true,
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
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ id: TARGET_ID, version: 5 }) }));
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]!);
    expect(finished[0]).toMatchObject({ mallKey: 'kidsnote', status: 'succeeded' });
  });

  it('leaves the target alone when the adapter has nothing to store', async () => {
    mocks.getAdapter.mockReturnValue({ ...adapter, adapterTargetInput: () => null });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ target: savedTarget }));
  });

  it('lets the adapter say a provider rejection in the operator’s words', async () => {
    mocks.getAdapter.mockReturnValue({ ...adapter, describeError: (message: string) => `번역: ${message}` });
    mocks.execute.mockRejectedValue(new Error('A registration registers exactly one option.'));
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task()]); });

    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: '번역: A registration registers exactly one option.' });
  });
});
