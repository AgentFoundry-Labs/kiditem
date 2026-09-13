import { describe, expect, it } from 'vitest';
import type { AlertItem } from '@kiditem/shared/alerts';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import type { SellpiaInventoryFreshnessView } from '@kiditem/shared/sellpia-inventory-freshness';
import { buildPipeSnapshot, mergeStageViews, type PipeInputs, type PipeStageView } from './pipe-model';
import { PIPE_STAGES } from './pipe-stages';

const NOW = Date.parse('2026-09-13T06:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function alert(overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    attemptId: '33333333-3333-4333-8333-333333333333',
    kind: 'signal',
    status: 'OPEN',
    type: 'source_failure',
    severity: 'error',
    title: '몰 주문수집 실패',
    message: '주문 목록을 읽지 못했습니다.',
    targetType: null,
    targetId: null,
    sourceType: 'order_collection_mall',
    href: '/order-collection',
    isRead: false,
    createdAt: ago(20),
    updatedAt: ago(20),
    ...overrides,
  };
}

function outcome(
  mallKey: string,
  operation: MallOperationOutcomeSummaryRow['operation'],
  latest: Partial<MallOperationOutcomeSummaryRow['latest']> = {},
): MallOperationOutcomeSummaryRow {
  return {
    mallKey,
    operation,
    latest: {
      id: `${mallKey}-${operation}`,
      mallKey,
      operation,
      outcome: 'succeeded',
      reasonCode: null,
      message: null,
      itemCount: null,
      failedCount: null,
      warningCount: null,
      trigger: null,
      runId: null,
      occurredAt: ago(5),
      ...latest,
    },
    counts: { succeeded: 0, empty: 0, attention: 0, failed: 0, cancelled: 0 },
  } as MallOperationOutcomeSummaryRow;
}

function inputs(overrides: Partial<PipeInputs> = {}): PipeInputs {
  return {
    now: NOW,
    alerts: { data: [], failed: false },
    outcomes: { data: [], failed: false },
    malls: {
      data: [
        { key: 'gs-shop', name: 'GS샵', enabled: true },
        { key: 'haebub-mall', name: '해법몰', enabled: true },
        { key: 'onch', name: '온채널', enabled: true },
      ],
      failed: false,
    },
    freshness: { data: null, failed: false },
    confirm: { data: null, failed: false },
    loginBlocks: [],
    ...overrides,
  };
}

const stage = (views: PipeStageView[], id: string) => views.find((view) => view.def.id === id)!;

describe('단계 표', () => {
  it('⭐ 한 알림 원천 · 몰 작업 종류가 두 단계에 걸리지 않는다', () => {
    for (const pick of [
      (s: (typeof PIPE_STAGES)[number]) => s.alertSourceTypes,
      (s: (typeof PIPE_STAGES)[number]) => s.mallOperations,
    ]) {
      const keys = PIPE_STAGES.flatMap((s) => [...pick(s)]);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('단계 번호가 빠짐없이 한 번씩 있다 — 13단계 뒤로 마케팅 세 단계(릴스 · 블로그 · 광고)가 잇는다', () => {
    const numbers = PIPE_STAGES.map((s) => s.no).filter((no): no is number => no !== null).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });
});

describe('모름은 0이 아니다', () => {
  /** 셀 곳이 없는 단계에 숫자를 지어내면, 그 숫자를 믿고 판단하게 된다. */
  it('⭐ 셀 곳이 없는 단계는 모름이고 왜 없는지를 들고 있다', () => {
    const { stages } = buildPipeSnapshot(inputs());
    for (const id of ['candidates', 'supplier', 'shortlist', 'content', 'register', 'reels', 'blog']) {
      const view = stage(stages, id);
      expect(view).toMatchObject({ state: 'unknown', measurable: false, lastCount: null });
      expect(view.reason).toBeTruthy();
    }
  });

  it('⭐ 실패 알림만 오는 단계는 알림이 없어도 완료로 치지 않고, 성공은 이 화면에 오지 않는다고 적는다', () => {
    const view = stage(buildPipeSnapshot(inputs()).stages, 'keyword');
    expect(view).toMatchObject({ state: 'unknown', measurable: true, lastCount: null });
    expect(view.reason).toContain('실패 알림이 없습니다');
  });

  it('⭐ 사장님 컨펌은 최종 후보의 결정 수로 선다 — 기다리는 후보가 있으면 사람 차례', () => {
    const counts = {
      runId: 'run-1',
      generatedAt: new Date(NOW - 3_600_000).toISOString(),
      total: 12,
      pending: 5,
      approved: 6,
      rejected: 1,
      lastReportAt: new Date(NOW - 600_000).toISOString(),
    };
    const waiting = buildPipeSnapshot(inputs({ confirm: { data: counts, failed: false } }));
    expect(stage(waiting.stages, 'gate')).toMatchObject({
      state: 'waiting_human',
      reason: '대기 5 · 승인 6 · 반려 1',
      lastCount: 12,
      measurable: true,
    });
    expect(waiting.inbox.map((item) => item.title)).toContain('사장님 컨펌 · 최종 후보 5개 대기');

    const decided = buildPipeSnapshot(inputs({ confirm: { data: { ...counts, pending: 0, approved: 11 }, failed: false } }));
    expect(stage(decided.stages, 'gate').state).toBe('done');
    expect(decided.inbox.some((item) => item.title.startsWith('사장님 컨펌'))).toBe(false);

    const failed = buildPipeSnapshot(inputs({ confirm: { data: null, failed: true } }));
    expect(stage(failed.stages, 'gate')).toMatchObject({ state: 'unknown', reason: '기록을 불러오지 못했습니다.' });
  });

  it('알림을 못 불러왔으면 그렇다고 적는다', () => {
    const view = stage(buildPipeSnapshot(inputs({ alerts: { data: null, failed: true } })).stages, 'competitor');
    expect(view).toMatchObject({ state: 'unknown', reason: '기록을 불러오지 못했습니다.' });
  });
});

describe('원천 실패 알림', () => {
  it('⭐ 열린 알림은 그 원천의 실패로 서고 확인 필요 한 장이 된다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ alerts: { data: [alert({ sourceType: 'coupang_ads_daily', title: '광고 일별 성과 수집 실패', message: '응답이 비어 있습니다.' })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'ads')).toMatchObject({ state: 'failed', reason: '응답이 비어 있습니다.' });
    expect(snapshot.inbox[0]).toMatchObject({ key: 'fail:coupang_ads_daily', state: 'failed', title: '광고 일별 성과 수집 실패', stageIds: ['ads'] });
  });

  it('⭐ 같은 원천이 다시 성공해 알림이 닫혔으면 빨강이 아니고, 지난 실패는 레인 숫자로만 남는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        alerts: {
          data: [
            alert({ id: '1a111111-1111-4111-8111-111111111111', sourceType: 'coupang_wing_rank', status: 'OPEN', updatedAt: ago(300) }),
            alert({ id: '1b111111-1111-4111-8111-111111111111', sourceType: 'coupang_wing_rank', status: 'RESOLVED', updatedAt: ago(10) }),
          ],
          failed: false,
        },
      }),
    );
    const view = stage(snapshot.stages, 'keyword');
    expect(view.state).toBe('done');
    expect(view.lane.exit).toEqual([{ label: '실패', count: 1 }]);
    expect(snapshot.inbox).toEqual([]);
  });

  it('로그인 때문에 멈췄다는 알림은 외부 막힘이다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ alerts: { data: [alert({ sourceType: 'sellpia_inventory', title: '셀피아 재고 수집 실패', message: '셀피아 로그인이 필요합니다.' })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'inventory').state).toBe('blocked_external');
    expect(snapshot.inbox[0]?.title).toBe('셀피아 재고 수집 실패 · 로그인 필요');
  });

  it('사람이 이미 읽은 알림은 사실로는 남기되 다시 조르지 않는다', () => {
    const snapshot = buildPipeSnapshot(inputs({ alerts: { data: [alert({ isRead: true })], failed: false } }));
    expect(stage(snapshot.stages, 'orders').state).toBe('failed');
    expect(snapshot.inbox).toEqual([]);
  });

  it('단계에 이어지지 않는 알림은 그림에 올리지 않는다', () => {
    const snapshot = buildPipeSnapshot(inputs({ alerts: { data: [alert({ sourceType: 'rules_evaluation' })], failed: false } }));
    expect(snapshot.inbox).toEqual([]);
    expect(snapshot.sources).toEqual({ alerts: 1, openAlerts: 1, outcomes: 0 });
  });
});

describe('실패라고 다 같은 실패가 아니다', () => {
  it('⭐ 확장 응답 시간 초과는 재시도 중이지 실패가 아니고, 인박스에 올리지 않는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ outcomes: { data: [outcome('haebub-mall', 'order_collection', { outcome: 'failed', reasonCode: 'extension_timeout' })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'orders').state).toBe('retrying');
    expect(snapshot.inbox).toEqual([]);
  });

  it('⭐ 수집기가 몰 화면을 못 따라간 것은 로직 점검으로 올린다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ outcomes: { data: [outcome('gs-shop', 'order_collection', { outcome: 'failed', reasonCode: 'provider_contract_changed' })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'orders').state).toBe('failed');
    expect(snapshot.inbox[0]).toMatchObject({ state: 'failed', title: 'GS샵 · 주문수집 로직 점검 필요' });
  });

  it('⭐ 사람이 제출할 차례는 실패가 아니라 사람 대기다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ outcomes: { data: [outcome('onch', 'registration_fill', { outcome: 'attention', reasonCode: 'manual_submit_required' })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'malls').state).toBe('waiting_human');
    expect(snapshot.inbox[0]).toMatchObject({ state: 'waiting_human', title: '온채널 · 제출 필요' });
  });
});

describe('원인이 같으면 한 장이다', () => {
  /** GS샵 로그인 만료가 몰 기억 · 자동 멈춤에 따로 남아도 사람이 할 일은 하나다. */
  it('⭐ 같은 몰의 로그인 막힘은 출처가 둘이어도 인박스 한 장으로 묶이고, 가장 구체적인 이름을 쓴다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        outcomes: { data: [outcome('gs-shop', 'order_collection', { outcome: 'attention', reasonCode: 'login_required' })], failed: false },
        loginBlocks: [{ mallKey: 'gs-shop', kind: 'login', reason: '비밀번호가 맞지 않습니다.', at: NOW - 30 * 60_000 }],
      }),
    );
    const login = snapshot.inbox.filter((item) => item.key === 'login:gs-shop');
    expect(login).toHaveLength(1);
    expect(login[0]).toMatchObject({ state: 'blocked_external', count: 2, title: 'GS샵 · 자동 멈춤, 직접 로그인', stageIds: ['orders'] });
    expect(snapshot.header.attention).toBe(1);
  });
});

describe('신선도', () => {
  it('⭐ 신호 단계가 하루 반 넘게 성공이 없으면 오래됨이다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ alerts: { data: [alert({ sourceType: 'coupang_keyword_serp', status: 'RESOLVED', updatedAt: ago(40 * 60) })], failed: false } }),
    );
    expect(stage(snapshot.stages, 'keyword').state).toBe('stale');
    expect(snapshot.inbox[0]).toMatchObject({ key: 'stale:keyword', state: 'stale' });
  });

  it('셀피아 재고가 새로고침이 필요하면 오래됨, 로그인이 풀려 실패했으면 외부 막힘이다', () => {
    const view = (status: SellpiaInventoryFreshnessView['status'], errorCode: string | null = null) =>
      stage(
        buildPipeSnapshot(
          inputs({
            freshness: {
              data: {
                status,
                lastVerifiedAt: ago(90),
                lastAttempt: errorCode ? { status: 'failed', errorCode, errorMessage: null, attemptedAt: ago(3) } : null,
                activeSync: null,
              } as unknown as SellpiaInventoryFreshnessView,
              failed: false,
            },
          }),
        ).stages,
        'inventory',
      ).state;
    expect(view('refresh_required')).toBe('stale');
    expect(view('failed', 'sellpia_login_required')).toBe('blocked_external');
    expect(view('fresh')).toBe('done');
  });
});

describe('몰 연결', () => {
  it('⭐ 가장 최근 증거가 이긴다 — 로그인 확인 성공이 차단보다 늦으면 차단은 낡은 것이다', () => {
    const { connectors } = buildPipeSnapshot(
      inputs({
        outcomes: {
          data: [
            outcome('gs-shop', 'login_check', { outcome: 'succeeded', occurredAt: ago(1) }),
            outcome('haebub-mall', 'order_collection', { outcome: 'attention', reasonCode: 'login_required', occurredAt: ago(3) }),
          ],
          failed: false,
        },
        loginBlocks: [{ mallKey: 'gs-shop', kind: 'login', reason: '실패', at: NOW - 60 * 60_000 }],
      }),
    );
    expect(connectors).toMatchObject({ total: 3, signedIn: 1, needsLogin: 1, unknown: 1, needsLoginNames: ['해법몰'] });
    expect(connectors.malls).toEqual([
      { key: 'gs-shop', name: 'GS샵', state: 'signed_in' },
      { key: 'haebub-mall', name: '해법몰', state: 'needs_login' },
      { key: 'onch', name: '온채널', state: 'unknown' },
    ]);
  });

  it('몰 목록을 못 받았으면 전체 수를 지어내지 않는다', () => {
    const { connectors } = buildPipeSnapshot(inputs({ malls: { data: null, failed: true } }));
    expect(connectors.total).toBeNull();
  });
});

describe('한 박스에 두 단계 — 합친 상태', () => {
  const syncing = {
    status: 'syncing',
    lastVerifiedAt: ago(90),
    lastAttempt: null,
    activeSync: { startedAt: ago(4) },
  } as unknown as SellpiaInventoryFreshnessView;

  /** 한쪽이 일하는 중인데 다른 쪽 기록이 없다고 박스를 '모름'으로 칠하면 일하는 게 안 보인다. */
  it('⭐ 기록이 없는 쪽의 모름이 다른 쪽의 진짜 활동을 가리지 않는다', () => {
    const { stages } = buildPipeSnapshot(inputs({ freshness: { data: syncing, failed: false } }));
    const merged = mergeStageViews([stage(stages, 'cs'), stage(stages, 'inventory')]);
    expect(stage(stages, 'cs').state).toBe('unknown');
    expect(merged.def.id).toBe('cs');
    expect(merged.state).toBe('running');
    expect(merged.lastAt).toBe(Date.parse(ago(4)));
  });

  it('둘 중 사람이 먼저 봐야 할 상태가 박스의 상태가 된다', () => {
    const { stages } = buildPipeSnapshot(
      inputs({
        freshness: { data: syncing, failed: false },
        alerts: { data: [alert({ message: '주문 목록 시간 초과' })], failed: false },
      }),
    );
    const merged = mergeStageViews([stage(stages, 'inventory'), stage(stages, 'orders')]);
    expect(merged.state).toBe('failed');
    expect(merged.reason).toBe('주문 목록 시간 초과');
    expect(merged.lane.exit).toEqual([{ label: '실패', count: 1 }]);
  });

  it('둘 다 기록이 없으면 모름이다', () => {
    const { stages } = buildPipeSnapshot(inputs());
    expect(mergeStageViews([stage(stages, 'register'), stage(stages, 'content')]).state).toBe('unknown');
  });
});
