import { describe, expect, it } from 'vitest';
import { isChannelKey } from '@kiditem/shared/channel-registry';
import type { AlertItem } from '@kiditem/shared/alerts';
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
    status: 'OPEN',
    type: 'source_failure',
    title: '쿠팡 쉽먼트 수집 실패',
    message: null,
    targetType: null,
    targetId: null,
    sourceType: 'orders.coupang_shipment_summary',
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
    expect(isMallAlert(alert('c', { sourceType: 'orders.coupang_directship' }))).toBe(true);
    expect(isMallAlert(alert('d', { sourceType: 'coupang_ad_campaign' }))).toBe(false);
    expect(isMallAlert(alert('e', { sourceType: '1688.hot_product' }))).toBe(false);
    expect(isMallAlert(alert('f', { sourceType: 'products.sellpia_inventory' }))).toBe(false);
    expect(isMallAlert(alert('g', { sourceType: null }))).toBe(false);
  });

  it('실행 표에서 온 알림(sourceType = kind)도 몰 알림이고 같은 몰을 말한다 — 정책 B(KID-355)', () => {
    const cases: Array<[string, string | null]> = [
      ['orders.mall_orders', null],
      ['orders.coupang_shipment_summary', 'rocket'],
      ['orders.coupang_rocket_po', 'rocket'],
      ['orders.coupang_directship', 'coupang-direct'],
      ['advertising.wing_traffic', 'coupang'],
      ['advertising.wing_itemwinner', 'coupang'],
    ];
    for (const [sourceType, mallKey] of cases) {
      const item = alert(sourceType, { type: 'operation_failure', sourceType });
      expect(isMallAlert(item), sourceType).toBe(true);
      expect(mallKeyOfAlert(item), sourceType).toBe(mallKey);
    }
    expect(isMallAlert(alert('s', { type: 'operation_failure', sourceType: 'products.sellpia_inventory' }))).toBe(false);
  });

  it('객체 기본 속성 이름에 속지 않는다', () => {
    expect(isMallAlert(alert('a', { sourceType: 'constructor' }))).toBe(false);
    expect(isMallAlert(alert('b', { sourceType: 'toString' }))).toBe(false);
  });
});

describe('mallKeyOfAlert', () => {
  it('쿠팡 원천은 원천 자체가 한 몰 것이다', () => {
    expect(mallKeyOfAlert(alert('a'))).toBe('rocket');
    expect(mallKeyOfAlert(alert('b', { sourceType: 'orders.coupang_directship' }))).toBe('coupang-direct');
    expect(mallKeyOfAlert(alert('c', { sourceType: 'advertising.wing_traffic' }))).toBe('coupang');
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
    }), { onch: 'signed_out' });
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
      alert('ok', { status: 'RESOLVED', sourceType: 'advertising.wing_traffic', title: '윙 트래픽 수집 실패' }),
      alert('fail', { title: '쿠팡 쉽먼트 수집 실패' }),
    ];
    const tiles = mallStatusTiles(channels, alerts, derivedMallAlerts({ channels, soldOutTotal: null, coupangPendingAccept: null }));
    expect(tiles.map((tile) => [tile.mallName, tile.tone, tile.label])).toEqual([
      ['쿠팡 로켓', 'failed', '쿠팡 쉽먼트 수집 실패 실패'],
      ['키즈노트', 'attention', '로그인 정보 없음'],
      ['쿠팡', 'ok', '윙 트래픽 수집 실패 해결'],
      ['올웨이즈', 'idle', '현재 기록 없음'],
    ]);
    expect(tiles[0]?.attentionCount).toBe(1);
    expect(tiles[1]?.attentionCount).toBe(1);
  });

  it('몰마다 도는 kind의 알림은 대상 채널 계정으로 그 몰 타일에 선다(KID-355)', () => {
    const account = '55555555-5555-4555-8555-555555555555';
    const mallChannels = [{ ...channel('gs-shop', 'GS샵'), channelAccountId: account }, channel('onch', '온채널')];
    const item = alert('mall', {
      type: 'operation_failure',
      sourceType: 'orders.mall_orders',
      title: 'GS샵 몰 주문 수집 실패',
      targetType: 'channel_account',
      targetId: account,
    });
    expect(mallKeyOfAlert(item)).toBeNull();
    expect(mallKeyOfAlert(item, new Map([[account, 'gs-shop']]))).toBe('gs-shop');
    expect(isMallAlert(alert('listings', { sourceType: 'channels.mall_admin_listings', targetType: 'channel_account', targetId: account }))).toBe(true);

    const tiles = mallStatusTiles(mallChannels, [item], []);
    expect(tiles.find((tile) => tile.mallKey === 'gs-shop')).toMatchObject({ tone: 'failed', label: 'GS샵 몰 주문 수집 실패 실패' });
    expect(tiles.find((tile) => tile.mallKey === 'onch')?.tone).not.toBe('failed');
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

  /**
   * 쿠팡직배송 원천 알림(발주서 · 직배송 주문 수집)은 로켓 계정 행을 함께 쓰는 몰의 일이다.
   * 타일은 계정 행의 채널로 서기 때문에 목록에 `coupang-direct` 줄이 없다 — 접지 않으면 이
   * 알림은 어느 타일에도 닿지 못하고 로켓 타일은 '최근 기록 없음'으로 선다.
   */
  it('⭐ 쿠팡직배송 원천 알림이 함께 쓰는 로켓 타일에 닿는다', () => {
    const direct = alert('direct', {
      sourceType: 'orders.coupang_directship',
      title: '쿠팡 직배송 주문 수집 실패',
    });
    const tile = mallStatusTiles([channel('rocket', '쿠팡 로켓')], [direct], [])[0];
    expect(tile).toMatchObject({
      mallKey: 'rocket',
      tone: 'failed',
      label: '쿠팡 직배송 주문 수집 실패 실패',
      attentionCount: 1,
    });
  });

});

describe('mallAlertCounts', () => {
  it('확인 필요 = 안 본 실패 + 지금 상태 알림', () => {
    const alerts = [alert('a'), alert('b', { isRead: true }), alert('c', { status: 'RESOLVED' })];
    const derived = derivedMallAlerts({ channels: [], soldOutTotal: 4, coupangPendingAccept: null });
    expect(mallAlertCounts(alerts, derived)).toEqual({ attention: 2 });
  });

  /** 자동 로그인 차단은 이 브라우저에만 있다. 알림판에는 서지만 위 칸 숫자에는 섞지 않는다. */
  it('⭐ 이 브라우저에만 있는 자동 로그인 차단은 확인 필요 숫자에 넣지 않는다', () => {
    const derived = derivedMallAlerts({
      channels: [channel('onch', '온채널')],
      manualLogin: [{ mallKey: 'onch', mallName: '온채널', kind: 'login' }],
      soldOutTotal: null,
      coupangPendingAccept: null,
    });
    expect(derived.map((item) => item.id)).toEqual(['derived:manual-login']);
    expect(mallAlertCounts([], derived)).toEqual({ attention: 0 });
  });
});

/**
 * 알림이 가리키는 몰은 채널 레지스트리의 키여야 한다(KID-250). 레지스트리에 없는 키를 적으면
 * 그 알림이 어느 타일에도 닿지 못하고, 사장님은 실패를 못 본다.
 */
describe('몰 원천 → 채널 키', () => {
  const SOURCE_TYPES = [
    'order_collection_mall',
    'orders.coupang_shipment_summary',
    'orders.coupang_rocket_po',
    'orders.coupang_directship',
    'advertising.wing_traffic',
    'advertising.wing_itemwinner',
  ];

  it('⭐ 몰을 말하는 원천의 몰 키가 모두 레지스트리에 있다', () => {
    for (const sourceType of SOURCE_TYPES) {
      const key = mallKeyOfAlert(alert('a', { sourceType }));
      expect([sourceType, key === null || isChannelKey(key)]).toEqual([sourceType, true]);
    }
  });

  it('몰 원천이 아닌 알림은 몰 알림이 아니다', () => {
    expect(isMallAlert(alert('a', { sourceType: 'coupang_ad_campaign' }))).toBe(false);
    expect(isMallAlert(alert('a', { sourceType: null }))).toBe(false);
  });
});
