import { describe, expect, it } from 'vitest';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import type { PanelAlertItem, PanelItem } from '@kiditem/shared/panel';
import {
  derivedMallAlerts,
  isMallAlert,
  mallAlertCounts,
  mallAlertState,
  mallAlertsFrom,
  mallKeyOfAlert,
  mallStatusTiles,
  needsAttention,
  splitExpiredAlerts,
} from './mall-alerts';

function alert(id: string, overrides: Partial<PanelAlertItem> = {}): PanelAlertItem {
  return {
    kind: 'alert',
    id,
    alertKind: 'operation',
    status: 'succeeded',
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
    href: '/order-collection',
    progress: null,
    metadata: {},
    readAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-09-11T01:00:00.000Z',
    ...overrides,
  };
}

const channel = (mallKey: string, mallName: string, hasCredentials = true) => ({
  mallKey,
  mallName,
  hasCredentials,
});

describe('isMallAlert', () => {
  it('몰에서 일한 알림만 고른다 — 광고·소싱·Sellpia 는 몰 알림이 아니다', () => {
    expect(isMallAlert(alert('a'))).toBe(true);
    expect(isMallAlert(alert('b', { sourceId: 'orders.coupang_rocket_po' }))).toBe(true);
    expect(isMallAlert(alert('c', { sourceType: 'coupang_sync', sourceId: null }))).toBe(true);
    expect(isMallAlert(alert('d', { sourceId: 'advertising.ad_sync' }))).toBe(false);
    expect(isMallAlert(alert('e', { sourceId: 'sourcing.1688_trend' }))).toBe(false);
    expect(isMallAlert(alert('f', { sourceId: 'inventory.sellpia' }))).toBe(false);
    expect(isMallAlert(alert('g', { sourceType: 'rules_evaluation', sourceId: null }))).toBe(false);
  });

  it('객체 기본 속성 이름에 속지 않는다', () => {
    expect(isMallAlert(alert('a', { sourceId: 'constructor' }))).toBe(false);
    expect(isMallAlert(alert('b', { sourceType: 'toString', sourceId: null }))).toBe(false);
  });
});

describe('mallKeyOfAlert', () => {
  it('몰 주문수집은 알림에 실린 mallKey 로 몰을 안다', () => {
    expect(mallKeyOfAlert(alert('a', { metadata: { mallKey: 'icecream-mall' } }))).toBe('icecream-mall');
  });

  /** 2026-09-11 이전 알림에는 mallKey 가 없다. 메시지에 몰 이름이 있어도 짐작하지 않는다. */
  it('⭐ 알림이 몰을 말하지 않으면 메시지에서 짐작하지 않는다', () => {
    expect(mallKeyOfAlert(alert('a', { message: '아이스크림몰 파일 생성 실패' }))).toBeNull();
  });

  it('쿠팡 수집기는 수집기 자체가 한 몰 것이다', () => {
    expect(mallKeyOfAlert(alert('a', { sourceId: 'orders.coupang_rocket_po' }))).toBe('rocket');
    expect(mallKeyOfAlert(alert('b', { sourceId: 'channels.coupang_catalog' }))).toBe('coupang');
    expect(mallKeyOfAlert(alert('c', { sourceType: 'coupang_sync', sourceId: null }))).toBe('coupang');
  });
});

describe('mallAlertState · needsAttention', () => {
  it('실패와 브라우저 수집 멈춤은 확인 필요, 서버 대기는 진행 중이다', () => {
    expect(mallAlertState(alert('a', { status: 'failed' }))).toBe('attention');
    expect(mallAlertState(alert('b', { status: 'pending' }))).toBe('attention');
    expect(mallAlertState(alert('c', { status: 'pending', sourceType: 'coupang_sync', sourceId: null }))).toBe('running');
    expect(mallAlertState(alert('d', { status: 'running' }))).toBe('running');
    expect(mallAlertState(alert('e', { status: 'succeeded' }))).toBe('done');
    expect(mallAlertState(alert('f', { status: 'cancelled' }))).toBe('done');
  });

  it('정리(읽음)한 실패는 다시 조르지 않는다', () => {
    expect(needsAttention(alert('a', { status: 'failed' }))).toBe(true);
    expect(needsAttention(alert('b', { status: 'failed', isRead: true }))).toBe(false);
  });
});

describe('mallAlertsFrom', () => {
  it('몰 알림만 — 확인 필요 먼저, 진행 중, 나머지는 최신순', () => {
    const byId: Record<string, PanelItem> = {
      done_old: alert('done_old', { createdAt: '2026-09-11T01:00:00.000Z' }),
      done_new: alert('done_new', { createdAt: '2026-09-11T03:00:00.000Z' }),
      running: alert('running', { status: 'running', createdAt: '2026-09-11T00:30:00.000Z' }),
      failed: alert('failed', { status: 'failed', createdAt: '2026-09-11T00:10:00.000Z' }),
      ads: alert('ads', { sourceId: 'advertising.ad_sync', status: 'failed' }),
    };
    expect(mallAlertsFrom(byId).map((item) => item.id)).toEqual(['failed', 'running', 'done_new', 'done_old']);
  });

  it('정리해 닫은 알림은 다시 세우지 않는다', () => {
    const byId: Record<string, PanelItem> = {
      tidy: alert('tidy', { status: 'cancelled', metadata: { staleReconciled: true } }),
      kept: alert('kept', { status: 'cancelled' }),
    };
    expect(mallAlertsFrom(byId).map((item) => item.id)).toEqual(['kept']);
  });
});

describe('splitExpiredAlerts', () => {
  const NOW = Date.parse('2026-09-11T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  /** 확장은 세션을 7일만 둔다. 그보다 오래 멈춘 수집은 어느 브라우저에서도 다시 움직일 수 없다. */
  it('⭐ 멈춘 채 7일 지난 수집은 확인 필요에서 빼 따로 모은다', () => {
    const stale = alert('stale', {
      status: 'pending',
      operationKey: 'browser-collection:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      metadata: { collectionAttempt: 1, collectionUpdatedAt: NOW - 8 * DAY },
    });
    const fresh = alert('fresh', {
      status: 'pending',
      operationKey: 'browser-collection:ffffffff-ffff-4fff-8fff-ffffffffffff',
      metadata: { collectionAttempt: 1, collectionUpdatedAt: NOW - 2 * DAY },
    });
    const done = alert('done', { status: 'succeeded' });
    const { live, expired } = splitExpiredAlerts([stale, fresh, done], NOW);
    expect(expired.map((item) => item.id)).toEqual(['stale']);
    expect(live.map((item) => item.id)).toEqual(['fresh', 'done']);
  });
});

describe('derivedMallAlerts', () => {
  it('로그인 정보가 비어 있는 몰을 이름과 함께 한 알림으로 모은다', () => {
    const [first] = derivedMallAlerts({
      channels: [
        channel('a', '가몰', false),
        channel('b', '나몰', false),
        channel('c', '다몰', false),
        channel('d', '라몰', false),
        channel('e', '마몰'),
      ],
      soldOutTotal: null,
      coupangPendingAccept: null,
    });
    expect(first?.title).toBe('로그인 정보가 비어 있는 몰 4곳');
    expect(first?.message).toContain('가몰, 나몰, 다몰 외 1곳');
    expect(first?.mallKeys).toEqual(['a', 'b', 'c', 'd']);
    expect(first?.href).toBe('/mall-settings');
  });

  it('⭐ 확장이 확인한 결과 로그인이 풀린 몰을 한 알림으로 모은다', () => {
    const [first] = derivedMallAlerts({
      channels: [channel('onch', '온채널')],
      signedOut: [{ mallKey: 'onch', mallName: '온채널' }],
      soldOutTotal: null,
      coupangPendingAccept: null,
    });
    expect(first).toMatchObject({
      id: 'derived:session-expired',
      title: '로그인이 풀린 몰 1곳',
      mallKeys: ['onch'],
      tileLabel: '로그인 필요',
    });
    const tiles = mallStatusTiles([channel('onch', '온채널')], [], derivedMallAlerts({
      channels: [channel('onch', '온채널')],
      signedOut: [{ mallKey: 'onch', mallName: '온채널' }],
      soldOutTotal: null,
      coupangPendingAccept: null,
    }), [], { onch: 'signed_out' });
    expect(tiles[0]).toMatchObject({ tone: 'attention', label: '로그인 필요', login: 'signed_out', attentionCount: 1 });
  });

  it('쿠팡 발주확인 대기와 품절 후보를 센다', () => {
    const alerts = derivedMallAlerts({ channels: [], soldOutTotal: 12, coupangPendingAccept: 3 });
    expect(alerts.map((item) => item.title)).toEqual(['쿠팡 발주확인 대기 3건', '품절 후보 12개']);
    expect(alerts[0]?.mallKeys).toEqual(['coupang']);
    expect(alerts[1]?.mallKeys).toEqual([]);
  });

  /** 0 이거나 모르면 서지 않는다. 모르는 것을 문제로도, 정상으로도 칠하지 않는다. */
  it('⭐ 0 이거나 못 받은 숫자로 알림을 지어내지 않는다', () => {
    expect(derivedMallAlerts({ channels: null, soldOutTotal: null, coupangPendingAccept: null })).toEqual([]);
    expect(derivedMallAlerts({ channels: [channel('a', '가몰')], soldOutTotal: 0, coupangPendingAccept: 0 })).toEqual([]);
  });
});

describe('mallStatusTiles', () => {
  const channels = [channel('onch', '온채널'), channel('kidsnote', '키즈노트', false), channel('domeggook', '도매꾹'), channel('always', '올웨이즈')];

  it('몰마다 지금 상태 — 문제 있는 몰부터', () => {
    const alerts = [
      alert('ok', { status: 'succeeded', metadata: { mallKey: 'domeggook' } }),
      alert('fail', { status: 'failed', metadata: { mallKey: 'onch' } }),
    ];
    const tiles = mallStatusTiles(channels, alerts, derivedMallAlerts({ channels, soldOutTotal: null, coupangPendingAccept: null }));
    expect(tiles.map((tile) => [tile.mallName, tile.tone, tile.label])).toEqual([
      ['온채널', 'failed', '주문 데이터 수집 실패'],
      ['키즈노트', 'attention', '로그인 정보 없음'],
      ['도매꾹', 'ok', '주문 데이터 수집 완료'],
      ['올웨이즈', 'idle', '최근 기록 없음'],
    ]);
    expect(tiles[0]?.attentionCount).toBe(1);
    expect(tiles[1]?.attentionCount).toBe(1);
  });

  it('가장 최근 일이 성공이면 예전 실패는 타일이 아니라 숫자로만 남는다', () => {
    const alerts = [
      alert('old', { status: 'failed', metadata: { mallKey: 'onch' }, createdAt: '2026-09-11T01:00:00.000Z' }),
      alert('new', { status: 'succeeded', metadata: { mallKey: 'onch' }, createdAt: '2026-09-11T02:00:00.000Z' }),
    ];
    const onch = mallStatusTiles(channels, alerts, []).find((tile) => tile.mallKey === 'onch');
    expect(onch?.tone).toBe('ok');
    expect(onch?.attentionCount).toBe(1);
  });

  /** 기억(몰 작업 결과)만 있어도 타일이 선다 — 알림이 몰을 말하지 않던 몰도 채워진다. */
  it('⭐ 기억에 남은 몰 작업 결과로 상태를 적는다', () => {
    const remembered = (
      mallKey: string,
      operation: MallOperationOutcomeSummaryRow['operation'],
      latest: Partial<MallOperationOutcomeSummaryRow['latest']>,
    ): MallOperationOutcomeSummaryRow => ({
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
        occurredAt: '2026-09-12T01:00:00.000Z',
        ...latest,
      },
      counts: { succeeded: 0, empty: 0, attention: 0, failed: 0, cancelled: 0 },
    });
    const tiles = mallStatusTiles(channels, [], [], [
      remembered('onch', 'order_collection', { outcome: 'attention', reasonCode: 'login_required' }),
      remembered('domeggook', 'order_collection', { outcome: 'succeeded', itemCount: 12 }),
      remembered('always', 'registration_fill', { outcome: 'attention', reasonCode: 'manual_submit_required' }),
    ]);
    const byKey = new Map(tiles.map((tile) => [tile.mallKey, tile]));
    expect(byKey.get('onch')).toMatchObject({ tone: 'attention', label: '주문수집 로그인 필요', attentionCount: 1 });
    expect(byKey.get('domeggook')).toMatchObject({ tone: 'ok', label: '주문수집 성공 · 12건' });
    expect(byKey.get('always')).toMatchObject({ tone: 'attention', label: '상품등록 제출 필요' });
  });

  /**
   * 같은 사건이 알림('주문 데이터 수집 · 확인 필요')과 기억('주문수집 인증 필요')에 두 번
   * 남는다. 알림이 몇 초 늦게 찍혔다고 이기면 사장님은 인증인지 로그인인지 알 수 없다.
   */
  it('⭐ 할 일을 이름으로 부르는 쪽이 이긴다 — 늦게 찍힌 "확인 필요"에 지지 않는다', () => {
    const vagueAlert = alert('session', {
      status: 'running',
      metadata: { mallKey: 'onch' },
      createdAt: '2026-09-12T02:00:00.000Z',
    });
    const verification: MallOperationOutcomeSummaryRow = {
      mallKey: 'onch',
      operation: 'order_collection',
      latest: {
        id: 'v',
        mallKey: 'onch',
        operation: 'order_collection',
        outcome: 'attention',
        reasonCode: 'operator_action_required',
        message: '본인 인증이 필요합니다.',
        itemCount: null,
        failedCount: null,
        warningCount: null,
        trigger: null,
        runId: null,
        occurredAt: '2026-09-12T01:00:00.000Z',
      },
      counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
    };
    const onch = mallStatusTiles(channels, [vagueAlert], [], [verification], {
      onch: 'signed_in',
    }).find((tile) => tile.mallKey === 'onch');

    expect(onch?.label).toBe('주문수집 인증 필요');
    expect(onch?.detail).toBe('본인 인증이 필요합니다.');
    // 세션은 살아 있어도 몰이 인증을 요구하면 '로그인됨'이라고 적지 않는다.
    expect(onch?.login).toBe('verification');
  });

  it('로그인이 필요한 몰은 인증이 아니라 로그인 필요로 남는다', () => {
    const loginNeeded: MallOperationOutcomeSummaryRow = {
      mallKey: 'onch',
      operation: 'order_collection',
      latest: {
        id: 'l',
        mallKey: 'onch',
        operation: 'order_collection',
        outcome: 'attention',
        reasonCode: 'login_required',
        message: null,
        itemCount: null,
        failedCount: null,
        warningCount: null,
        trigger: null,
        runId: null,
        occurredAt: '2026-09-12T01:00:00.000Z',
      },
      counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
    };
    const onch = mallStatusTiles(channels, [], [], [loginNeeded], { onch: 'signed_out' }).find(
      (tile) => tile.mallKey === 'onch',
    );
    expect(onch?.label).toBe('주문수집 로그인 필요');
    expect(onch?.login).toBe('signed_out');
  });

  it('주문수집 알림이 조르는 동안 같은 주문수집 기억은 두 번 세지 않는다', () => {
    const failedAlert = alert('fail', { status: 'failed', metadata: { mallKey: 'onch' } });
    const rememberedFailure: MallOperationOutcomeSummaryRow = {
      mallKey: 'onch',
      operation: 'order_collection',
      latest: {
        id: 'x',
        mallKey: 'onch',
        operation: 'order_collection',
        outcome: 'failed',
        reasonCode: 'network_failed',
        message: null,
        itemCount: null,
        failedCount: null,
        warningCount: null,
        trigger: null,
        runId: null,
        occurredAt: '2026-09-11T02:00:00.000Z',
      },
      counts: { succeeded: 0, empty: 0, attention: 0, failed: 1, cancelled: 0 },
    };
    const onch = mallStatusTiles(channels, [failedAlert], [], [rememberedFailure]).find(
      (tile) => tile.mallKey === 'onch',
    );
    expect(onch?.attentionCount).toBe(1);
  });

  it('⭐ 방금 확인한 로그인 상태가 지난 로그인 확인 기록보다 앞선다', () => {
    const lastCheck: MallOperationOutcomeSummaryRow = {
      mallKey: 'onch',
      operation: 'login_check',
      latest: {
        id: 'y',
        mallKey: 'onch',
        operation: 'login_check',
        outcome: 'attention',
        reasonCode: 'login_required',
        message: null,
        itemCount: null,
        failedCount: null,
        warningCount: null,
        trigger: 'auto',
        runId: null,
        occurredAt: '2026-09-12T01:00:00.000Z',
      },
      counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
    };
    const onchOnly = [channel('onch', '온채널')];
    // 확인 전 — 지난 기록이 말한다.
    expect(mallStatusTiles(onchOnly, [], [], [lastCheck])[0]).toMatchObject({
      tone: 'attention',
      label: '로그인 확인 로그인 필요',
      login: null,
    });
    // 방금 다시 로그인된 것을 확인했다 — 지난 '로그인 필요'로 조르지 않는다.
    expect(mallStatusTiles(onchOnly, [], [], [lastCheck], { onch: 'signed_in' })[0]).toMatchObject({
      tone: 'idle',
      label: '최근 기록 없음',
      login: 'signed_in',
      attentionCount: 0,
    });
  });
});

describe('mallAlertCounts', () => {
  it('확인 필요 = 안 본 멈춤·실패 + 지금 상태 알림, 진행 중 = 도는 일', () => {
    const alerts = [
      alert('a', { status: 'failed' }),
      alert('b', { status: 'failed', isRead: true }),
      alert('c', { status: 'running' }),
    ];
    const derived = derivedMallAlerts({ channels: [], soldOutTotal: 4, coupangPendingAccept: null });
    expect(mallAlertCounts(alerts, derived)).toEqual({ attention: 2, running: 1 });
  });
});
