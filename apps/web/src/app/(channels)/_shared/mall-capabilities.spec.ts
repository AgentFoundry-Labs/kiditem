import { describe, expect, it } from 'vitest';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import {
  capabilityTotals,
  mallCapabilities,
  ordersLabelFor,
  ordersNoteFor,
  readyCount,
  registerNoteFor,
  soldOutNoteFor,
  sortByCapability,
  type MallManifestFacts,
} from './mall-capabilities';

const channel = (overrides: Partial<MallChannelSummary> = {}): MallChannelSummary => ({
  mallKey: 'x',
  mallName: 'X',
  channelAccountId: null,
  canPublish: false,
  hasCredentials: false,
  imported: false,
  collectsOrders: false,
  orderCollectionVia: null,
  uploadsTracking: false,
  listingCount: 0,
  orderCount: 0,
  productCount: 0,
  readiness: 'unsupported',
  ...overrides,
});

const manifest = (overrides: Partial<MallManifestFacts> = {}): MallManifestFacts => ({
  applicable: true,
  unverified: false,
  supports: { soldOut: true },
  hazards: { soldOutDeletesListing: false },
  ...overrides,
});

/** 사입 채널(쿠팡 로켓·쿠팡직배송) — 상품등록도 품절 송신도 개념이 없다. */
const notApplicable = manifest({ applicable: false, supports: { soldOut: false } });

describe('mallCapabilities', () => {
  it('서버가 경로가 있다고 한 일만 초록이고, 나머지는 회색이다', () => {
    const caps = mallCapabilities(channel({ collectsOrders: true }), { hasAdapter: false, manifest: manifest() });
    expect(caps).toEqual({
      orders: 'ready',
      claims: 'pending',
      tracking: 'pending',
      inquiries: 'pending',
      inquiryReplies: 'pending',
      register: 'pending',
      update: 'pending',
      soldout: 'pending',
      stock: 'pending',
    });
  });

  it('상품등록은 등록 어댑터가 있어야 초록이다', () => {
    expect(mallCapabilities(channel(), { hasAdapter: true, manifest: manifest() }).register).toBe('ready');
  });

  /**
   * 쿠팡 로켓·쿠팡직배송은 우리가 발주를 받는 사입 채널이라 상품등록·품절 송신 개념이 없다
   * (매니페스트 `applicable: false`). 회색으로 두면 "언젠가 된다" 로 읽힌다.
   */
  it('⭐ 개념이 없는 채널은 상품등록·품절관리가 빨강이다 — 어댑터가 있어도', () => {
    const caps = mallCapabilities(channel(), { hasAdapter: true, manifest: notApplicable });
    expect(caps.register).toBe('unavailable');
    expect(caps.soldout).toBe('unavailable');
  });

  /** 발주를 받는 사입 채널에는 고객 클레임 · 문의도, 우리가 고칠 상품 페이지도, 보낼 재고도 없다. */
  it('⭐ 사입 채널은 클레임 · 문의 · 상품수정 · 재고송신도 빨강이다 — 주문수집 · 운송장은 그대로', () => {
    const caps = mallCapabilities(
      channel({ collectsOrders: true }),
      { hasAdapter: false, manifest: notApplicable },
    );
    expect(caps).toMatchObject({
      orders: 'ready',
      tracking: 'pending',
      claims: 'unavailable',
      inquiries: 'unavailable',
      inquiryReplies: 'unavailable',
      update: 'unavailable',
      stock: 'unavailable',
    });
  });

  /** 클레임 · 문의 수집, 문의 답변, 상품수정 · 재고 송신 경로는 아직 어느 몰에도 없다. */
  it('새로 붙은 칸은 아직 초록이 없다 — 경로가 붙기 전까지 회색', () => {
    const caps = mallCapabilities(
      channel({ collectsOrders: true, uploadsTracking: true }),
      { hasAdapter: true, manifest: manifest() },
    );
    for (const key of ['claims', 'inquiries', 'inquiryReplies', 'update', 'stock'] as const) {
      expect(caps[key]).toBe('pending');
    }
  });

  /**
   * 품절 송신 경로는 아직 어느 몰에도 없다(품절 관리 화면은 미리보기만). 몰이 품절을 받는다고
   * 매니페스트에 적혀 있어도 초록이 아니다 — 눌러서 되는 게 아니다.
   */
  it('⭐ 품절관리는 아직 초록이 없다 — 몰이 받아도 우리 송신 경로가 없다', () => {
    const caps = mallCapabilities(channel(), { hasAdapter: true, manifest: manifest({ supports: { soldOut: true } }) });
    expect(caps.soldout).toBe('pending');
  });

  it('확인 전인 몰과 매니페스트를 못 받은 경우는 불가로 단정하지 않는다', () => {
    expect(mallCapabilities(channel(), { hasAdapter: false, manifest: manifest({ unverified: true, supports: { soldOut: false } }) }).soldout).toBe('pending');
    expect(mallCapabilities(channel(), { hasAdapter: false, manifest: null })).toEqual({
      orders: 'pending',
      claims: 'pending',
      tracking: 'pending',
      inquiries: 'pending',
      inquiryReplies: 'pending',
      register: 'pending',
      update: 'pending',
      soldout: 'pending',
      stock: 'pending',
    });
  });

  it('확인된 몰인데 품절을 안 받으면 품절관리는 불가다', () => {
    expect(mallCapabilities(channel(), { hasAdapter: false, manifest: manifest({ supports: { soldOut: false } }) }).soldout).toBe('unavailable');
  });

  it('되는 일 수를 센다', () => {
    const caps = mallCapabilities(
      channel({ collectsOrders: true, uploadsTracking: true }),
      { hasAdapter: true, manifest: manifest() },
    );
    expect(readyCount(caps)).toBe(3);
  });
});

describe('capabilityTotals', () => {
  it('일마다 됨 · 아직 · 불가 몰 수를 센다', () => {
    const rows = [
      { capabilities: mallCapabilities(channel({ collectsOrders: true }), { hasAdapter: true, manifest: manifest() }) },
      { capabilities: mallCapabilities(channel(), { hasAdapter: false, manifest: notApplicable }) },
      { capabilities: mallCapabilities(channel(), { hasAdapter: false, manifest: manifest() }) },
    ];
    const totals = capabilityTotals(rows);
    expect(totals.orders).toEqual({ ready: 1, pending: 2, unavailable: 0 });
    expect(totals.tracking).toEqual({ ready: 0, pending: 3, unavailable: 0 });
    expect(totals.register).toEqual({ ready: 1, pending: 1, unavailable: 1 });
    expect(totals.soldout).toEqual({ ready: 0, pending: 2, unavailable: 1 });
  });
});

describe('sortByCapability', () => {
  const row = (mallName: string, overrides: Partial<MallChannelSummary>, context = { hasAdapter: false, manifest: manifest() as MallManifestFacts | null }) => {
    const summary = channel({ mallName, ...overrides });
    return { channel: summary, capabilities: mallCapabilities(summary, context) };
  };

  it('다 되는 몰부터 선다', () => {
    const sorted = sortByCapability([
      row('토스쇼핑', {}),
      row('온채널', { collectsOrders: true, uploadsTracking: true }, { hasAdapter: true, manifest: manifest() }),
      row('키즈노트', { collectsOrders: true }, { hasAdapter: true, manifest: manifest() }),
    ]);
    expect(sorted.map((item) => item.channel.mallName)).toEqual(['온채널', '키즈노트', '토스쇼핑']);
  });

  it('되는 일 수가 같으면 없는 일이 적은 몰, 그다음 거래가 있는 몰, 마지막은 이름순', () => {
    const sorted = sortByCapability([
      row('쿠팡 로켓', { orderCount: 113 }, { hasAdapter: false, manifest: notApplicable }),
      row('카카오', {}),
      row('롯데ON', { orderCount: 5 }),
      row('가나몰', {}),
    ]);
    expect(sorted.map((item) => item.channel.mallName)).toEqual(['롯데ON', '가나몰', '카카오', '쿠팡 로켓']);
  });
});

/**
 * 옥션 · 지마켓 · 11번가 · 신세계 · 스마트스토어는 셀피아가 그 몰에서 주문을 직접 가져온다.
 * 같은 초록이어도 길이 다르다는 것이 카드 줄 이름에서 바로 읽혀야 한다(사장님 2026-09-17).
 */
describe('ordersLabelFor / ordersNoteFor', () => {
  it('⭐ 셀피아가 가져오는 몰은 주문수집 줄 이름이 "셀피아 주문수집"이고 초록이다', () => {
    const sellpia = channel({ collectsOrders: true, orderCollectionVia: 'sellpia' });

    expect(ordersLabelFor(sellpia)).toBe('셀피아 주문수집');
    expect(ordersNoteFor(sellpia)).toContain('셀피아 주문수집으로 들어옵니다');
    expect(mallCapabilities(sellpia, { hasAdapter: false, manifest: manifest() }).orders).toBe('ready');
  });

  it('우리 수집기로 가져오는 몰과 들어오지 않는 몰은 이름을 바꾸지 않는다', () => {
    expect(ordersLabelFor(channel({ collectsOrders: true, orderCollectionVia: 'kiditem' }))).toBeNull();
    expect(ordersNoteFor(channel({ collectsOrders: true, orderCollectionVia: 'kiditem' }))).toBeNull();
    expect(ordersLabelFor(channel())).toBeNull();
  });
});

describe('registerNoteFor', () => {
  const esm = { mallKey: 'gmarket', mallName: 'G마켓 · 옥션', alsoPublishesTo: ['auction'] };
  const nameOf = (key: string) => ({ auction: '옥션', gmarket: '지마켓' }[key] ?? key);

  it('⭐ 옥션은 G마켓 등록에 함께 올라간다고 적는다', () => {
    expect(registerNoteFor('auction', esm, nameOf)).toBe('G마켓 · 옥션 등록 한 번에 함께 올라갑니다.');
  });

  it('G마켓은 옥션까지 한 번에 올라간다고 적는다', () => {
    expect(registerNoteFor('gmarket', esm, nameOf)).toBe('옥션까지 한 번에 올라갑니다.');
  });

  it('보통 몰과 경로가 없는 몰에는 사연이 없다', () => {
    expect(registerNoteFor('onch', { mallKey: 'onch', mallName: '온채널' }, nameOf)).toBeNull();
    expect(registerNoteFor('toss', null, nameOf)).toBeNull();
  });
});

describe('soldOutNoteFor', () => {
  it('몰은 받는데 우리 경로만 없는 곳과 확인 전인 곳을 가른다', () => {
    expect(soldOutNoteFor(manifest())).toBe('몰은 품절·해제를 받습니다. 우리 송신 경로가 아직 없습니다.');
    expect(soldOutNoteFor(manifest({ unverified: true, supports: { soldOut: false } })))
      .toBe('이 몰의 품절 방식은 아직 확인 전입니다.');
  });

  /** G마켓·옥션은 완전품절이 영구삭제다. 경로를 만들 때 이걸 모르면 상품이 사라진다. */
  it('⭐ 완전품절이 영구삭제인 몰은 판매중지로 보내야 한다고 적는다', () => {
    expect(soldOutNoteFor(manifest({ hazards: { soldOutDeletesListing: true } })))
      .toContain('판매중지로 보내야');
  });

  it('개념이 없는 채널과 매니페스트가 없을 때는 사연이 없다', () => {
    expect(soldOutNoteFor(notApplicable)).toBeNull();
    expect(soldOutNoteFor(null)).toBeNull();
  });
});
