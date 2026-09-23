import { describe, expect, it, vi } from 'vitest';
import { buildPublishPlan, collectManualSteps, summarizePublishRun } from './publish-plan';
import type { PublishTask } from '../../_shared/use-mall-publish-run';
import type {
  MallPublishAdapter,
  MallPublishItem,
} from '../../_shared/mall-publish-adapter';

function item(id: string, overrides: Partial<MallPublishItem> = {}): MallPublishItem {
  return { candidateId: id, name: `상품 ${id}`, salePrice: 1000, thumbnailUrl: null, ...overrides };
}

function adapter(overrides: Partial<MallPublishAdapter> = {}): MallPublishAdapter {
  return {
    mallKey: 'mall',
    mallName: '몰',
    mode: 'form',
    batchSize: 1,
    requiresOperatorSubmit: true,
    fields: [],
    preview: () => [],
    validate: () => [],
    send: vi.fn(async () => ({ ok: true, confirmed: false, manualSteps: [], warnings: [] })),
    ...overrides,
  };
}

describe('buildPublishPlan', () => {
  it('상품 1개당 작업 1개로 쪼갠다 — 폼 자동채움은 탭 하나를 점유한다', () => {
    const plan = buildPublishPlan({
      items: [item('a'), item('b'), item('c')],
      adapters: [adapter({ mallKey: 'kidsnote', batchSize: 1 })],
      valuesByMall: {},
    });

    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks.map((task) => task.items.map((one) => one.candidateId))).toEqual([
      ['a'], ['b'], ['c'],
    ]);
    expect(plan.sendCount).toBe(3);
  });

  it('일괄 경로는 상품 전부를 작업 하나에 담는다', () => {
    const plan = buildPublishPlan({
      items: [item('a'), item('b'), item('c')],
      adapters: [adapter({ mallKey: 'coupang', batchSize: Number.POSITIVE_INFINITY })],
      valuesByMall: {},
    });

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.items).toHaveLength(3);
  });

  it('N개 상품 × M개 몰이 몰마다 다른 크기로 잘린다', () => {
    const plan = buildPublishPlan({
      items: [item('a'), item('b')],
      adapters: [
        adapter({ mallKey: 'coupang', mallName: '쿠팡', batchSize: Number.POSITIVE_INFINITY }),
        adapter({ mallKey: 'kidsnote', mallName: '키즈노트', batchSize: 1 }),
      ],
      valuesByMall: {},
    });

    expect(plan.tasks.map((task) => task.id)).toEqual([
      'coupang#0', 'kidsnote#0', 'kidsnote#1',
    ]);
    // 작업은 3개지만 실제 (상품 × 몰) 은 4건이다. 확인 문구는 4를 써야 한다.
    expect(plan.sendCount).toBe(4);
  });

  it('막힌 상품은 작업에 넣지 않고 이유만 남긴다', () => {
    const plan = buildPublishPlan({
      items: [item('a', { salePrice: 0 }), item('b')],
      adapters: [
        adapter({
          mallKey: 'kidsnote',
          mallName: '키즈노트',
          validate: (one) => (one.salePrice ? [] : ['판매가가 0원입니다.']),
        }),
      ],
      valuesByMall: {},
    });

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.items[0]?.candidateId).toBe('b');
    expect(plan.blocks).toEqual([
      {
        mallKey: 'kidsnote',
        mallName: '키즈노트',
        candidateId: 'a',
        productName: '상품 a',
        reasons: ['판매가가 0원입니다.'],
      },
    ]);
    expect(plan.sendCount).toBe(1);
  });

  it('한 몰에서 막힌 상품이 다른 몰에서는 나간다', () => {
    const plan = buildPublishPlan({
      items: [item('a', { salePrice: 0 })],
      adapters: [
        adapter({ mallKey: 'coupang', validate: () => [] }),
        adapter({ mallKey: 'kidsnote', validate: () => ['판매가 없음'] }),
      ],
      valuesByMall: {},
    });

    expect(plan.tasks.map((task) => task.mallKey)).toEqual(['coupang']);
    expect(plan.blocks.map((block) => block.mallKey)).toEqual(['kidsnote']);
  });

  it('몰별 값이 검증에 그대로 전달된다', () => {
    const validate = vi.fn(() => []);
    buildPublishPlan({
      items: [item('a')],
      adapters: [adapter({ mallKey: 'kidsnote', validate })],
      valuesByMall: { kidsnote: { category: '장난감' } },
    });

    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ candidateId: 'a' }), {
      category: '장난감',
    });
  });

  it('freezes the exact selected account and only values the operator edited', () => {
    const plan = buildPublishPlan({
      items: [item('a')],
      adapters: [adapter({ mallKey: 'kidsnote' })],
      valuesByMall: { kidsnote: { categoryPath: '기본값', returnFee: '3000' } },
      editedValuesByMall: { kidsnote: { returnFee: '3000' } },
      channelAccountIds: { kidsnote: 'channel-account-id' },
    });

    expect(plan.tasks[0]).toMatchObject({
      channelAccountId: 'channel-account-id',
      adapterValues: { returnFee: '3000' },
    });
    expect(plan.tasks[0]?.adapterValues).not.toHaveProperty('categoryPath');
  });

  it('이미 그 몰 계정에 등록됐거나 보내는 중인 상품은 기본으로 빼고 이유를 남긴다(KID-320)', () => {
    const account = (state: string) => ({
      channelAccountId: 'channel-account-id', channel: 'kidsnote', channelAccountName: '키즈노트',
      registrationTargetId: null, channelListingId: null, externalListingId: null, state,
      soldOut: false, changedSinceRegistration: false, selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null, lastExecution: null,
    });
    const plan = buildPublishPlan({
      items: [item('a'), item('b'), item('c'), item('d')],
      adapters: [adapter({ mallKey: 'kidsnote', mallName: '키즈노트' })],
      valuesByMall: {},
      channelAccountIds: { kidsnote: 'channel-account-id' },
      registrationAccountsByItem: new Map([
        ['a', [account('registered')]],
        ['b', [account('submitting')]],
        ['c', [account('failed')]],
      ] as never),
    });

    expect(plan.tasks.flatMap((task) => task.items.map((one) => one.candidateId))).toEqual(['c', 'd']);
    expect(plan.blocks).toEqual([
      expect.objectContaining({ candidateId: 'a', reasons: ['이 몰 계정에 이미 등록됨 — 바뀐 값은 수정으로 보냅니다.'] }),
      expect.objectContaining({ candidateId: 'b', reasons: ['이 몰 계정으로 전송 중 — 끝난 뒤 다시 고르세요.'] }),
    ]);
  });

  it('보낼 것이 하나도 없으면 작업이 없다', () => {
    const plan = buildPublishPlan({
      items: [],
      adapters: [adapter({ batchSize: Number.POSITIVE_INFINITY })],
      valuesByMall: {},
    });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.sendCount).toBe(0);
  });
});

function task(overrides: Partial<PublishTask> = {}): PublishTask {
  return {
    id: 'mall#0',
    mallKey: 'mall',
    mallName: '몰',
    channelAccountId: 'channel-account-id',
    items: [item('a')],
    values: {},
    adapterValues: {},
    status: 'pending',
    outcome: null,
    error: null,
    ...overrides,
  };
}

describe('summarizePublishRun', () => {
  it('남은 작업이 있으면 끝난 것이 아니다', () => {
    const summary = summarizePublishRun([
      task({ id: '1', status: 'succeeded' }),
      task({ id: '2', status: 'pending' }),
    ]);
    expect(summary.done).toBe(false);
    expect(summary.succeeded).toBe(1);
  });

  it('성공과 등록확인을 따로 센다 — 폼을 채운 것은 등록이 아니다', () => {
    const summary = summarizePublishRun([
      task({
        id: '1',
        status: 'succeeded',
        outcome: { ok: true, confirmed: false, manualSteps: [], warnings: [] },
      }),
      task({
        id: '2',
        status: 'succeeded',
        outcome: { ok: true, confirmed: true, manualSteps: [], warnings: [] },
      }),
    ]);
    expect(summary.succeeded).toBe(2);
    expect(summary.confirmed).toBe(1);
    expect(summary.done).toBe(true);
  });

  it('작업이 없으면 끝났다고 하지 않는다', () => {
    expect(summarizePublishRun([]).done).toBe(false);
  });
});

describe('collectManualSteps', () => {
  it('같은 몰의 같은 안내는 한 번만 모은다', () => {
    const steps = collectManualSteps([
      task({
        id: '1',
        mallName: '키즈노트',
        outcome: { ok: true, confirmed: false, manualSteps: ['제출 버튼을 누르세요.'], warnings: [] },
      }),
      task({
        id: '2',
        mallName: '키즈노트',
        outcome: { ok: true, confirmed: false, manualSteps: ['제출 버튼을 누르세요.'], warnings: [] },
      }),
    ]);
    expect(steps).toEqual([{ mallName: '키즈노트', step: '제출 버튼을 누르세요.' }]);
  });

  it('몰이 다르면 같은 문구도 따로 남는다', () => {
    const steps = collectManualSteps([
      task({ id: '1', mallName: '쿠팡', outcome: { ok: true, confirmed: false, manualSteps: ['확인'], warnings: [] } }),
      task({ id: '2', mallName: '키즈노트', outcome: { ok: true, confirmed: false, manualSteps: ['확인'], warnings: [] } }),
    ]);
    expect(steps).toHaveLength(2);
  });
});
