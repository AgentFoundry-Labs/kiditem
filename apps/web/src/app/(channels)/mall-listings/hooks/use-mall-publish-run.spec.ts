import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { getMallPublishAdapter } from '../../_shared/adapters';
import { executeTargetRegistration } from '../../_shared/target-registration-execution';
import { listRegistrationTargetExecutions } from '../../_shared/registration-execution-api';
import { buildPublishPlan } from '../lib/publish-plan';
import { useMallPublishRun } from './use-mall-publish-run';
import type { MallPublishAdapter, MallPublishItem } from '../../_shared/mall-publish-adapter';
import type { PublishTask } from '../lib/publish-plan';
import type { SalesProduct, TargetExecutionResult } from '@kiditem/shared/sales-product';

const mocks = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  execute: vi.fn(),
  history: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('../../_shared/adapters', () => ({ getMallPublishAdapter: mocks.getAdapter }));
vi.mock('../../_shared/target-registration-execution', () => ({
  executeTargetRegistration: mocks.execute,
  isActiveTargetExecution: (execution: { status: string }) => ['prepared', 'executing', 'reconciling'].includes(execution.status),
}));
vi.mock('../../_shared/registration-execution-api', () => ({
  listRegistrationTargetExecutions: mocks.history,
}));
vi.mock('@/lib/registration-target-api', () => ({ registrationTargetApi: { resolve: mocks.resolve } }));

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

  it('passes the explicitly selected target to resolve for this item', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => {
      await result.current.start([task({ registrationTargetIdsByItem: { [PRODUCT_ID]: 'selected-target-id' } })]);
    });

    expect(mocks.resolve).toHaveBeenCalledWith({
      salesProductId: PRODUCT_ID,
      channelAccountId: ACCOUNT_ID,
      targetId: 'selected-target-id',
    });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ targetId: TARGET_ID }));
  });

  it('does not resolve or send when a multi-target item has no explicit choice', async () => {
    const plan = buildPublishPlan({
      items: [item()],
      adapters: [adapter],
      valuesByMall: {},
      registrationTargetSelectionRequiredByMall: { kidsnote: [PRODUCT_ID] },
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start(plan.tasks); });

    expect(plan.sendCount).toBe(0);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
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

  it('promotes a candidate before target resolution and execution', async () => {
    const product = { id: PRODUCT_ID } as SalesProduct;
    const sequence: string[] = [];
    mocks.resolve.mockImplementation(async () => { sequence.push('resolve'); return target; });
    mocks.history.mockImplementation(async () => { sequence.push('history'); return []; });
    mocks.execute.mockImplementation(async () => {
      sequence.push('execute');
      return { execution: { status: 'reconciling' }, outcome: { ok: true, confirmed: false, manualSteps: [], warnings: [] }, adapterCalled: true };
    });
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => {
      await result.current.start([task({ items: [item('candidate')] })], {
        ensureCandidateSalesProduct: async (candidateId) => {
          sequence.push(`promote:${candidateId}`);
          return product;
        },
      });
    });

    expect(sequence).toEqual(['promote:candidate-id', 'resolve', 'history', 'execute']);
  });

  it('stops before target creation when the selected mall has no exact account ID', async () => {
    const { result } = renderHook(() => useMallPublishRun());

    await act(async () => { await result.current.start([task({ channelAccountId: null })]); });

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(result.current.tasks[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('계정 식별자') });
  });
});
