import { describe, expect, it } from 'vitest';
import type { AlertItem } from '@kiditem/shared/alerts';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import {
  derivedMallAlerts,
  isMallAlert,
  mallAlertCounts,
  mallAlertState,
  mallAlertsFrom,
  mallKeyOfAlert,
  mallStatusTiles,
  needsAttention,
} from './mall-alerts';

function alert(id: string, overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id,
    attemptId: null,
    kind: 'signal',
    status: 'OPEN',
    type: 'source_failure',
    severity: 'error',
    title: '쿠팡 쉽먼트 수집 실패',
    message: null,
    targetType: null,
    targetId: null,
    sourceType: 'coupang_shipment_summary',
    href: '/coupang-shipments',
    isRead: false,
    createdAt: '2026-09-11T01:00:00.000Z',
    updatedAt: '2026-09-11T01:00:00.000Z',
    ...overrides,
  };
}

const channel = (mallKey: string, mallName: string, hasCredentials = true) => ({
  mallKey,
  mallName,
  hasCredentials,
});

describe('isMallAlert', () => {
  it('몰에서 일한 원천의 알림만 고른다 — 광고 · 소싱 · Sellpia 는 몰 알림이 아니다', () => {
    expect(isMallAlert(alert('a'))).toBe(true);
    expect(isMallAlert(alert('b', { sourceType: 'order_collection_mall' }))).toBe(true);
    expect(isMallAlert(alert('c', { sourceType: 'coupang_direct_order_capture' }))).toBe(true);
    expect(isMallAlert(alert('d', { sourceType: 'coupang_ad_campaign' }))).toBe(false);
    expect(isMallAlert(alert('e', { sourceType: '1688.hot_product' }))).toBe(false);
    expect(isMallAlert(alert('f', { sourceType: 'sellpia_inventory' }))).toBe(false);
    expect(isMallAlert(alert('g', { sourceType: null }))).toBe(false);
  });

  it('객체 기본 속성 이름에 속지 않는다', () => {
    expect(isMallAlert(alert('a', { sourceType: 'constructor' }))).toBe(false);
    expect(isMallAlert(alert('b', { sourceType: 'toString' }))).toBe(false);
  });
});

describe('mallKeyOfAlert', () => {
  it('쿠팡 원천은 원천 자체가 한 몰 것이다', () => {
    expect(mallKeyOfAlert(alert('a'))).toBe('rocket');
    expect(mallKeyOfAlert(alert('b', { sourceType: 'coupang_rocket_final_order' }))).toBe('coupang-direct');
    expect(mallKeyOfAlert(alert('c', { sourceType: 'coupang_wing_traffic' }))).toBe('coupang');
  });

  /** 몰 주문수집 원천은 알림이 어느 몰인지 말하지 않는다. 제목에 몰 이름이 있어도 짐작하지 않는다. */
  it('⭐ 알림이 몰을 말하지 않으면 제목 · 메시지에서 짐작하지 않는다', () => {
    expect(mallKeyOfAlert(alert('a', { sourceType: 'order_collection_mall', title: '아이스크림몰 주문수집 실패' }))).toBeNull();
  });
});

describe('mallAlertState · needsAttention', () => {
  it('열린 알림은 확인 필요, 닫힌 알림은 다시 성공한 일이다', () => {
    expect(mallAlertState(alert('a'))).toBe('attention');
    expect(mallAlertState(alert('b', { status: 'RESOLVED' }))).toBe('done');
  });

  it('읽음으로 둔 실패는 다시 조르지 않는다', () => {
    expect(needsAttention(alert('a'))).toBe(true);
    expect(needsAttention(alert('b', { isRead: true }))).toBe(false);
    expect(needsAttention(alert('c', { status: 'RESOLVED' }))).toBe(false);
  });
});

describe('mallAlertsFrom', () => {
  it('몰 알림만 — 안 본 실패 먼저, 읽은 실패, 나머지는 최신순', () => {
    const alerts = [
      alert('done_old', { status: 'RESOLVED', updatedAt: '2026-09-11T01:00:00.000Z' }),
      alert('done_new', { status: 'RESOLVED', updatedAt: '2026-09-11T03:00:00.000Z' }),
      alert('read', { isRead: true, updatedAt: '2026-09-11T00:30:00.000Z' }),
      alert('failed', { updatedAt: '2026-09-11T00:10:00.000Z' }),
      alert('ads', { sourceType: 'coupang_ad_campaign' }),
    ];
    expect(mallAlertsFrom(alerts).map((item) => item.id)).toEqual(['failed', 'read', 'done_new', 'done_old']);
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
  const channels = [channel('rocket', '쿠팡 로켓'), channel('kidsnote', '키즈노트', false), channel('coupang', '쿠팡'), channel('always', '올웨이즈')];

  it('몰마다 지금 상태 — 문제 있는 몰부터', () => {
    const alerts = [
      alert('ok', { status: 'RESOLVED', sourceType: 'coupang_wing_traffic', title: '윙 트래픽 수집 실패' }),
      alert('fail', { title: '쿠팡 쉽먼트 수집 실패' }),
    ];
    const tiles = mallStatusTiles(channels, alerts, derivedMallAlerts({ channels, soldOutTotal: null, coupangPendingAccept: null }));
    expect(tiles.map((tile) => [tile.mallName, tile.tone, tile.label])).toEqual([
      ['쿠팡 로켓', 'failed', '쿠팡 쉽먼트 수집 실패 실패'],
      ['키즈노트', 'attention', '로그인 정보 없음'],
      ['쿠팡', 'ok', '윙 트래픽 수집 실패 해결'],
      ['올웨이즈', 'idle', '최근 기록 없음'],
    ]);
    expect(tiles[0]?.attentionCount).toBe(1);
    expect(tiles[1]?.attentionCount).toBe(1);
  });

  it('원천이 다시 성공해 닫힌 알림이 가장 최근이면 예전 실패는 타일이 아니라 숫자로만 남는다', () => {
    const alerts = [
      alert('old', { updatedAt: '2026-09-11T01:00:00.000Z' }),
      alert('new', { id: 'new', status: 'RESOLVED', updatedAt: '2026-09-11T02:00:00.000Z' }),
    ];
    const rocket = mallStatusTiles(channels, alerts, []).find((tile) => tile.mallKey === 'rocket');
    expect(rocket?.tone).toBe('ok');
    expect(rocket?.attentionCount).toBe(1);
  });

  /** 기억(몰 작업 결과)만 있어도 타일이 선다 — 알림이 몰을 말하지 않는 몰도 채워진다. */
  it('⭐ 기억에 남은 몰 작업 결과로 상태를 적는다', () => {
    const tiles = mallStatusTiles(channels, [], [], [
      remembered('rocket', 'order_collection', { outcome: 'attention', reasonCode: 'login_required' }),
      remembered('coupang', 'order_collection', { outcome: 'succeeded', itemCount: 12 }),
      remembered('always', 'registration_fill', { outcome: 'attention', reasonCode: 'manual_submit_required' }),
    ]);
    const byKey = new Map(tiles.map((tile) => [tile.mallKey, tile]));
    expect(byKey.get('rocket')).toMatchObject({ tone: 'attention', label: '주문수집 로그인 필요', attentionCount: 1 });
    expect(byKey.get('coupang')).toMatchObject({ tone: 'ok', label: '주문수집 성공 · 12건' });
    expect(byKey.get('always')).toMatchObject({ tone: 'attention', label: '상품등록 제출 필요' });
  });

  /**
   * 같은 사건이 알림과 기억에 두 번 남을 때, 알림이 몇 초 늦게 찍혔다고 이기면 사장님은 인증인지
   * 로그인인지 알 수 없다.
   */
  it('⭐ 할 일을 이름으로 부르는 쪽이 이긴다 — 늦게 찍힌 막연한 실패에 지지 않는다', () => {
    const vagueAlert = alert('session', { updatedAt: '2026-09-12T02:00:00.000Z' });
    const verification = remembered('rocket', 'order_collection', {
      outcome: 'attention',
      reasonCode: 'operator_action_required',
      message: '본인 인증이 필요합니다.',
      occurredAt: '2026-09-12T01:00:00.000Z',
    });
    const rocket = mallStatusTiles(channels, [vagueAlert], [], [verification], {
      rocket: 'signed_in',
    }).find((tile) => tile.mallKey === 'rocket');

    expect(rocket?.label).toBe('주문수집 인증 필요');
    expect(rocket?.detail).toBe('본인 인증이 필요합니다.');
    // 세션은 살아 있어도 몰이 인증을 요구하면 '로그인됨'이라고 적지 않는다.
    expect(rocket?.login).toBe('verification');
  });

  it('로그인이 필요한 몰은 인증이 아니라 로그인 필요로 남는다', () => {
    const rocket = mallStatusTiles(
      channels,
      [],
      [],
      [remembered('rocket', 'order_collection', { outcome: 'attention', reasonCode: 'login_required' })],
      { rocket: 'signed_out' },
    ).find((tile) => tile.mallKey === 'rocket');
    expect(rocket?.label).toBe('주문수집 로그인 필요');
    expect(rocket?.login).toBe('signed_out');
  });

  it('주문수집 알림이 조르는 동안 같은 주문수집 기억은 두 번 세지 않는다', () => {
    const rocket = mallStatusTiles(channels, [alert('fail')], [], [
      remembered('rocket', 'order_collection', { outcome: 'failed', reasonCode: 'network_failed', occurredAt: '2026-09-11T02:00:00.000Z' }),
    ]).find((tile) => tile.mallKey === 'rocket');
    expect(rocket?.attentionCount).toBe(1);
  });

  it('⭐ 방금 확인한 로그인 상태가 지난 로그인 확인 기록보다 앞선다', () => {
    const lastCheck = remembered('rocket', 'login_check', { outcome: 'attention', reasonCode: 'login_required', trigger: 'auto' });
    const rocketOnly = [channel('rocket', '쿠팡 로켓')];
    // 확인 전 — 지난 기록이 말한다.
    expect(mallStatusTiles(rocketOnly, [], [], [lastCheck])[0]).toMatchObject({
      tone: 'attention',
      label: '로그인 확인 로그인 필요',
      login: null,
    });
    // 방금 다시 로그인된 것을 확인했다 — 지난 '로그인 필요'로 조르지 않는다.
    expect(mallStatusTiles(rocketOnly, [], [], [lastCheck], { rocket: 'signed_in' })[0]).toMatchObject({
      tone: 'idle',
      label: '최근 기록 없음',
      login: 'signed_in',
      attentionCount: 0,
    });
  });
});

describe('mallAlertCounts', () => {
  it('확인 필요 = 안 본 실패 + 지금 상태 알림', () => {
    const alerts = [alert('a'), alert('b', { isRead: true }), alert('c', { status: 'RESOLVED' })];
    const derived = derivedMallAlerts({ channels: [], soldOutTotal: 4, coupangPendingAccept: null });
    expect(mallAlertCounts(alerts, derived)).toEqual({ attention: 2 });
  });
});

function remembered(
  mallKey: string,
  operation: MallOperationOutcomeSummaryRow['operation'],
  latest: Partial<MallOperationOutcomeSummaryRow['latest']>,
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
      occurredAt: '2026-09-12T01:00:00.000Z',
      ...latest,
    },
    counts: { succeeded: 0, empty: 0, attention: 0, failed: 0, cancelled: 0 },
  };
}
