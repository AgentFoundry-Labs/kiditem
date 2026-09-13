import { describe, expect, it } from 'vitest';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import type { OperationRun } from '@kiditem/shared/operations';
import type { PanelAlertItem, PanelItem } from '@kiditem/shared/panel';
import type { SellpiaInventoryFreshnessView } from '@kiditem/shared/sellpia-inventory-freshness';
import { buildPipeSnapshot, mergeStageViews, type PipeInputs, type PipeStageView } from './pipe-model';
import { PIPE_STAGES } from './pipe-stages';

const NOW = Date.parse('2026-09-13T06:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function run(overrides: Partial<OperationRun> = {}): OperationRun {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    operationKey: 'sourcing.collect_daily_trends',
    definitionVersion: 1,
    title: '일별 트렌드 수집',
    ownerDomain: 'sourcing',
    engineType: 'domain',
    resourceClass: 'naver_api',
    executionTimeoutMs: 600000,
    status: 'succeeded',
    triggerSource: 'domain_screen',
    parentRunId: null,
    scheduleId: null,
    nativeRunType: null,
    nativeRunId: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
    result: { outcome: 'complete', summary: { accepted: 1240 } },
    error: null,
    requestedBy: null,
    scheduledFor: null,
    startedAt: ago(12),
    finishedAt: ago(10),
    createdAt: ago(12),
    updatedAt: ago(10),
    ...overrides,
  } as OperationRun;
}

function alert(overrides: Partial<PanelAlertItem> = {}): PanelAlertItem {
  return {
    kind: 'alert',
    id: '22222222-2222-4222-8222-222222222222',
    alertKind: 'operation',
    status: 'running',
    severity: 'info',
    type: 'browser_collection',
    title: '주문 데이터 수집',
    message: null,
    targetType: null,
    targetId: null,
    operationKey: null,
    sourceType: 'browser_collection_session',
    sourceId: 'orders.mall',
    isRead: false,
    actionTaskId: null,
    actorUserId: null,
    href: null,
    progress: null,
    metadata: { mallKey: 'gs-shop', collectionUpdatedAt: NOW - 60_000 },
    readAt: null,
    startedAt: ago(2),
    finishedAt: null,
    createdAt: ago(2),
    ...overrides,
  } as PanelAlertItem;
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
    runs: { data: [], failed: false },
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
    panelItems: [],
    loginBlocks: [],
    ...overrides,
  };
}

const stage = (views: PipeStageView[], id: string) => views.find((view) => view.def.id === id)!;

describe('단계 표', () => {
  it('⭐ 한 실행·수집·알림 종류가 두 단계에 걸리지 않는다', () => {
    for (const pick of [
      (s: (typeof PIPE_STAGES)[number]) => s.operationKeys,
      (s: (typeof PIPE_STAGES)[number]) => s.producers,
      (s: (typeof PIPE_STAGES)[number]) => s.alertTypes,
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
    for (const id of ['candidates', 'shortlist', 'cs', 'reels', 'blog']) {
      const view = stage(stages, id);
      expect(view).toMatchObject({ state: 'unknown', measurable: false, lastCount: null });
      expect(view.reason).toBeTruthy();
    }
  });

  it('셀 곳은 있는데 기록이 없으면 모름 · 최근 기록 없음 — 완료로 치지 않는다', () => {
    const view = stage(buildPipeSnapshot(inputs()).stages, 'supplier');
    expect(view).toMatchObject({ state: 'unknown', measurable: true, lastCount: null });
    expect(view.reason).toContain('최근 실행 기록');
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

  it('기록을 못 불러왔으면 그렇다고 적는다', () => {
    const view = stage(buildPipeSnapshot(inputs({ runs: { data: null, failed: true } })).stages, 'supplier');
    expect(view).toMatchObject({ state: 'unknown', reason: '기록을 불러오지 못했습니다.' });
  });
});

describe('같은 대상은 최신 것만 상태가 된다', () => {
  it('⭐ 어제 실패했어도 그 뒤에 성공했으면 빨강이 아니고, 지난 실패는 레인 숫자로만 남는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        runs: {
          data: [
            run({ id: '1a111111-1111-4111-8111-111111111111', status: 'failed', finishedAt: ago(300), error: { code: 'naver_failed', message: '네이버 응답 없음' } }),
            run({ id: '1b111111-1111-4111-8111-111111111111', status: 'succeeded', finishedAt: ago(10) }),
          ],
          failed: false,
        },
      }),
    );
    const view = stage(snapshot.stages, 'keyword');
    expect(view.state).toBe('done');
    expect(view.lastCount).toBe(1240);
    expect(view.lane.exit).toEqual([{ label: '실패', count: 1 }]);
    expect(snapshot.inbox).toEqual([]);
  });

  it('사람이 취소한 실행은 머리 상태를 바꾸지 않고 레인에 취소로만 남는다', () => {
    const view = stage(
      buildPipeSnapshot(inputs({ runs: { data: [run({ operationKey: 'sourcing.scrape_url', status: 'cancelled' })], failed: false } })).stages,
      'supplier',
    );
    expect(view.state).toBe('unknown');
    expect(view.lane.exit).toEqual([{ label: '취소', count: 1 }]);
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

  it('로그인 필요로 멈춘 서버 실행은 외부 막힘이다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        runs: {
          data: [run({ operationKey: 'sourcing.search_1688_keyword_batch', title: '1688 키워드 검색', status: 'attention_required', error: { code: 'marketplace_login', message: '1688 로그인이 필요합니다.' } })],
          failed: false,
        },
      }),
    );
    expect(stage(snapshot.stages, 'supplier').state).toBe('blocked_external');
    expect(snapshot.inbox[0]?.title).toBe('1688 키워드 검색 · 로그인 필요');
  });
});

describe('원인이 같으면 한 장이다', () => {
  /** GS샵 로그인 만료가 수집 알림 · 몰 기억 · 자동 멈춤에 따로 남아도 사람이 할 일은 하나다. */
  it('⭐ 같은 몰의 로그인 막힘은 출처가 셋이어도 인박스 한 장으로 묶이고, 가장 구체적인 이름을 쓴다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        panelItems: [alert({ status: 'pending', metadata: { mallKey: 'gs-shop', attentionReason: 'marketplace_login', collectionUpdatedAt: NOW - 60_000 } })] as PanelItem[],
        outcomes: { data: [outcome('gs-shop', 'order_collection', { outcome: 'attention', reasonCode: 'login_required' })], failed: false },
        loginBlocks: [{ mallKey: 'gs-shop', kind: 'login', reason: '비밀번호가 맞지 않습니다.', at: NOW - 30 * 60_000 }],
      }),
    );
    const login = snapshot.inbox.filter((item) => item.key === 'login:gs-shop');
    expect(login).toHaveLength(1);
    expect(login[0]).toMatchObject({ state: 'blocked_external', count: 3, title: 'GS샵 · 자동 멈춤, 직접 로그인', stageIds: ['orders'] });
    expect(snapshot.header.attention).toBe(1);
  });

  it('사람이 이미 읽은 알림은 사실로는 남기되 다시 조르지 않는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ panelItems: [alert({ status: 'failed', isRead: true })] as PanelItem[] }),
    );
    expect(stage(snapshot.stages, 'orders').state).toBe('failed');
    expect(snapshot.inbox).toEqual([]);
  });
});

describe('확장이 못 보는 것', () => {
  it('확장이 없어서 멈춘 수집은 모름 + 확인 필요 한 장이다 — 정상으로 치지 않는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        runs: { data: [run({ operationKey: 'orders.collect_all_marketplace_orders', title: '전체 몰 주문수집', finishedAt: ago(60) })], failed: false },
        panelItems: [alert({ status: 'pending', metadata: { attentionReason: 'extension_missing', collectionUpdatedAt: NOW - 60_000 } })] as PanelItem[],
      }),
    );
    expect(stage(snapshot.stages, 'orders').state).toBe('unknown');
    expect(snapshot.inbox[0]).toMatchObject({ key: 'extension', title: '확장 연결 확인 필요' });
  });

  it('7일 넘게 멈춘 수집 알림은 다시 세우지 않는다', () => {
    const old = Date.parse(ago(8 * 24 * 60));
    const snapshot = buildPipeSnapshot(
      inputs({
        panelItems: [
          alert({ status: 'pending', operationKey: 'browser-collection:33333333-3333-4333-8333-333333333333', metadata: { mallKey: 'gs-shop', attentionReason: 'marketplace_login', collectionUpdatedAt: old } }),
        ] as PanelItem[],
      }),
    );
    expect(snapshot.inbox).toEqual([]);
  });
});

describe('확장이 옛 버전인 경우', () => {
  it('⭐ 확장에 작업 코드가 없어서 멈춘 실행은 실패가 아니라 확장 확인 필요이고, 코드를 그대로 보여 주지 않는다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({
        runs: {
          data: [run({ operationKey: 'sourcing.collect_1688_trends', title: '1688 핫랭킹 수집', status: 'attention_required', error: { code: 'browser_operation_handler_missing', message: 'browser_operation_handler_missing' } })],
          failed: false,
        },
      }),
    );
    const view = stage(snapshot.stages, 'rising');
    expect(view.state).toBe('unknown');
    expect(view.reason).not.toContain('browser_operation_handler_missing');
    expect(snapshot.inbox[0]).toMatchObject({ key: 'extension', title: '확장 연결 확인 필요' });
  });

  it('서버가 코드만 준 오류는 사람이 읽을 수 있는 문장으로 감싼다', () => {
    const view = stage(
      buildPipeSnapshot(
        inputs({ runs: { data: [run({ operationKey: 'sourcing.scrape_url', status: 'failed', error: { code: 'all_targets_failed', message: 'all_targets_failed' } })], failed: false } }),
      ).stages,
      'supplier',
    );
    expect(view.reason).toBe('확인이 필요한 상태입니다. (all_targets_failed)');
  });
});

describe('신선도', () => {
  it('⭐ 신호 단계가 하루 반 넘게 성공이 없으면 오래됨이다', () => {
    const snapshot = buildPipeSnapshot(
      inputs({ runs: { data: [run({ finishedAt: ago(40 * 60) })], failed: false } }),
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

describe('한 박스에 두 단계 — 상품등록 + 상세페이지 · 썸네일', () => {
  const content = (overrides: Partial<PanelItem> = {}) =>
    ({
      kind: 'run',
      id: 'run-thumb',
      seq: 1,
      createdAt: ago(30),
      updatedAt: ago(4),
      title: '썸네일 생성',
      actorUserId: null,
      visibility: 'organization',
      source: 'image',
      sourceId: 'gen-1',
      status: 'running',
      deepLink: '/product-pipeline/thumbnail-generation?generationId=gen-1',
      ...overrides,
    }) as PanelItem;

  /** 상세페이지를 만드는 중인데 상품등록 기록이 없다고 박스를 '모름'으로 칠하면 일하는 게 안 보인다. */
  it('⭐ 기록이 없는 쪽의 모름이 다른 쪽의 진짜 활동을 가리지 않는다', () => {
    const { stages } = buildPipeSnapshot(inputs({ panelItems: [content()] }));
    const merged = mergeStageViews([stage(stages, 'register'), stage(stages, 'content')]);
    expect(stage(stages, 'register').state).toBe('unknown');
    expect(merged.def.id).toBe('register');
    expect(merged.state).toBe('running');
    expect(merged.lastAt).toBe(Date.parse(ago(4)));
  });

  it('둘 중 사람이 먼저 봐야 할 상태가 박스의 상태가 된다', () => {
    const { stages } = buildPipeSnapshot(
      inputs({
        panelItems: [content({ status: 'failed', errorMessage: '이미지 생성 시간 초과' } as Partial<PanelItem>)],
        runs: { data: [run({ operationKey: 'products.generate_listing_package', title: '상품 등록 생성 패키지 준비' })], failed: false },
      }),
    );
    const merged = mergeStageViews([stage(stages, 'register'), stage(stages, 'content')]);
    expect(merged.state).toBe('failed');
    expect(merged.reason).toBe('이미지 생성 시간 초과');
    expect(merged.lane.exit).toEqual([{ label: '실패', count: 1 }]);
  });

  it('둘 다 기록이 없으면 모름이다', () => {
    const { stages } = buildPipeSnapshot(inputs());
    expect(mergeStageViews([stage(stages, 'register'), stage(stages, 'content')]).state).toBe('unknown');
  });
});
