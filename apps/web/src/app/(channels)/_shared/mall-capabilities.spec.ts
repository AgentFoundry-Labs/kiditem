import { describe, expect, it } from 'vitest';
import {
  bulkNoteFor,
  capabilityTotals,
  CAPABILITY_KEYS,
  mallCapabilities,
  ordersLabelFor,
  ordersNoteFor,
  readyCount,
  registerNoteFor,
  resumeNoteFor,
  soldOutNoteFor,
  sortByCapability,
  type MallBulkSheetFacts,
  type MallCapabilities,
  type MallManifestFacts,
} from './mall-capabilities';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';

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
  optionCount: 0,
  matchedOptionCount: 0,
  onSaleOptionCount: 0,
  onSaleMatchedOptionCount: 0,
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
      bulk: 'pending',
      update: 'pending',
      soldout: 'pending',
      resume: 'pending',
      stock: 'pending',
    });
  });

  const bulkSheets: MallBulkSheetFacts = {
    sheets: new Map([
      ['gmarket', { label: 'G마켓 · 옥션', mallKeys: ['gmarket', 'auction'] }],
      ['auction', { label: 'G마켓 · 옥션', mallKeys: ['gmarket', 'auction'] }],
    ]),
    unavailable: new Map([['lotte-on', '롯데ON은 신규 등록 엑셀이 없습니다(일괄수정만).']]),
  };

  it('대량등록은 몰 엑셀 목록에 있는 몰만 됨, 신규 등록 엑셀이 없는 몰은 불가, 목록을 못 받으면 아직이다', () => {
    const bulk = (mallKey: string, facts: MallBulkSheetFacts | null = bulkSheets, facts2: MallManifestFacts | null = manifest()) =>
      mallCapabilities(channel({ mallKey }), { hasAdapter: true, manifest: facts2, bulkSheets: facts }).bulk;
    expect(bulk('auction')).toBe('ready');
    expect(bulk('lotte-on')).toBe('unavailable');
    expect(bulk('ssg')).toBe('pending');
    expect(bulk('auction', null)).toBe('pending');
    // Canonical registry identifies Gmarket as a retail listing channel even with stale manifest data.
    expect(bulk('gmarket', bulkSheets, notApplicable)).toBe('ready');
    expect(bulk('rocket', bulkSheets, null)).toBe('unavailable');
  });

  it('대량등록 사연은 받는 곳과 한 파일에 함께 들어가는 몰, 또는 엑셀이 없는 까닭이다', () => {
    const names = (key: string) => ({ gmarket: 'G마켓', auction: '옥션' } as Record<string, string>)[key] ?? key;
    expect(bulkNoteFor('auction', bulkSheets, names)).toBe(
      '판매상품 화면 [몰 대량등록 엑셀] › G마켓 · 옥션 — G마켓·옥션 한 파일에서 이 몰 양식을 채워 받습니다.',
    );
    expect(bulkNoteFor('lotte-on', bulkSheets, names)).toBe('롯데ON은 신규 등록 엑셀이 없습니다(일괄수정만).');
    expect(bulkNoteFor('ssg', bulkSheets, names)).toBeNull();
    expect(bulkNoteFor('auction', null, names)).toBeNull();
  });

  it('상품등록은 등록 어댑터가 있어야 초록이다', () => {
    expect(mallCapabilities(channel(), { hasAdapter: true, manifest: manifest() }).register).toBe('ready');
  });

  /**
   * 쿠팡 로켓·쿠팡직배송은 우리가 발주를 받는 사입 채널이라 상품등록·품절 송신 개념이 없다
   * (매니페스트 `applicable: false`). 회색으로 두면 "언젠가 된다" 로 읽힌다.
   */
  it('⭐ 개념이 없는 채널은 상품등록·품절관리·판매재개가 빨강이다 — 어댑터가 있어도', () => {
    const caps = mallCapabilities(channel(), { hasAdapter: true, manifest: notApplicable });
    expect(caps.register).toBe('unavailable');
    expect(caps.soldout).toBe('unavailable');
    expect(caps.resume).toBe('unavailable');
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
      bulk: 'pending',
      update: 'pending',
      soldout: 'pending',
      resume: 'pending',
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
    expect(totals.resume).toEqual({ ready: 0, pending: 2, unavailable: 1 });
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

  /** 초록 칸에 "경로가 아직 없다"를 적으면 칸이 거짓말을 한다(2026-09-19 전에는 그렇게 적혔다). */
  it('⭐ 우리 길이 있는 몰에는 "경로가 없다" 사연을 붙이지 않는다', () => {
    expect(soldOutNoteFor(manifest({ soldOutRoute: 'mall_admin' }))).toBeNull();
    // 몰 API 는 확인 전이어도 관리자 화면의 품절 길은 확인했다(지마켓 · 옥션 · 11번가 · 스마트스토어) — "확인 전" 도 아니다.
    expect(soldOutNoteFor(manifest({ unverified: true, soldOutRoute: 'mall_admin' }))).toBeNull();
    expect(resumeNoteFor(manifest({ unverified: true, supports: { soldOut: true, resume: true }, resumeRoute: 'mall_admin' })))
      .toBeNull();
  });
});

describe('resumeNoteFor', () => {
  it('몰이 해제를 자동으로 받지 않으면 몰에서 직접 풀어야 한다고 적는다', () => {
    expect(resumeNoteFor(manifest({ supports: { soldOut: true, resume: false }, soldOutRoute: 'mall_admin' })))
      .toContain('직접 풀어야');
  });

  it('길이 있으면 사연이 없고, 없으면 경로가 아직 없다고 적는다', () => {
    expect(resumeNoteFor(manifest({ supports: { soldOut: true, resume: true }, resumeRoute: 'mall_admin' }))).toBeNull();
    expect(resumeNoteFor(manifest({ supports: { soldOut: true, resume: true } })))
      .toBe('몰은 판매재개를 받습니다. 우리 송신 경로가 아직 없습니다.');
    expect(resumeNoteFor(manifest({ unverified: true, supports: { soldOut: false } })))
      .toBe('이 몰의 판매재개 방식은 아직 확인 전입니다.');
  });

  it('개념이 없는 채널 · 품절을 안 받는 몰 · 매니페스트가 없을 때는 사연이 없다', () => {
    expect(resumeNoteFor(notApplicable)).toBeNull();
    expect(resumeNoteFor(manifest({ supports: { soldOut: false } }))).toBeNull();
    expect(resumeNoteFor(null)).toBeNull();
  });
});

describe('품절 송신 칸', () => {
  it('우리가 그 몰 관리자를 뚫은 몰만 초록이다', () => {
    const wired = mallCapabilities(channel(), {
      hasAdapter: true,
      manifest: manifest({ supports: { soldOut: true }, soldOutRoute: 'mall_admin' }),
    });
    expect(wired.soldout).toBe('ready');
  });

  it('몰이 품절을 받아도 우리 경로가 없으면 초록이 아니다', () => {
    // 이 칸은 몰의 사정이 아니라 **우리가 지금 보낼 수 있는가**를 말한다.
    const noRoute = mallCapabilities(channel(), {
      hasAdapter: true,
      manifest: manifest({ supports: { soldOut: true }, soldOutRoute: null }),
    });
    expect(noRoute.soldout).toBe('pending');
  });

  it('품절을 안 받는다고 확인된 몰은 경로와 무관하게 빨강이다', () => {
    const refuses = mallCapabilities(channel(), {
      hasAdapter: true,
      manifest: manifest({ supports: { soldOut: false }, soldOutRoute: 'mall_admin' }),
    });
    expect(refuses.soldout).toBe('unavailable');
    expect(refuses.resume).toBe('unavailable');
  });
});

/** 사장님 2026-09-19: "품절관리랑 판매재개 기능 구별해서 되는지 구별해놔줘". */
describe('판매재개 칸', () => {
  it('⭐ 해제 길(resumeRoute)이 있는 몰만 초록이다 — 품절 길과 따로 본다', () => {
    const both = mallCapabilities(channel(), {
      hasAdapter: false,
      manifest: manifest({ supports: { soldOut: true, resume: true }, soldOutRoute: 'mall_admin', resumeRoute: 'mall_admin' }),
    });
    expect(both).toMatchObject({ soldout: 'ready', resume: 'ready' });
    const soldOutOnly = mallCapabilities(channel(), {
      hasAdapter: false,
      manifest: manifest({ supports: { soldOut: true, resume: true }, soldOutRoute: 'mall_admin', resumeRoute: null }),
    });
    expect(soldOutOnly).toMatchObject({ soldout: 'ready', resume: 'pending' });
  });

  it('⭐ 몰이 품절 해제를 자동으로 받지 않는다고 확인되면 판매재개만 빨강이다', () => {
    const caps = mallCapabilities(channel(), {
      hasAdapter: false,
      manifest: manifest({ supports: { soldOut: true, resume: false }, soldOutRoute: 'mall_admin', resumeRoute: null }),
    });
    expect(caps).toMatchObject({ soldout: 'ready', resume: 'unavailable' });
  });

  it('확인 전인 몰은 해제를 안 받는다고 단정하지 않는다', () => {
    const caps = mallCapabilities(channel(), {
      hasAdapter: false,
      manifest: manifest({ unverified: true, supports: { soldOut: false, resume: false } }),
    });
    expect(caps.resume).toBe('pending');
  });
});

describe('몰 차례 — 칸을 왼쪽부터 훑어 되는 몰이 위로', () => {
  /**
   * 되는 일 **수**로만 세우면 같은 수인 몰이 무더기로 생기고, 그 안에서는 어느 칸이 켜졌는지와
   * 무관하게 섞인다. 그러면 운송장 송신처럼 세 곳뿐인 칸을 세로로 훑을 때 그 셋이 표 여기저기에
   * 흩어진다 — 사장님 2026-09-22: "운송장송신 보면 되는걸 위로 하면 3개가 연달아 보여야한다".
   */
  const rowOf = (mallName: string, capabilities: Partial<MallCapabilities>) => ({
    channel: channel({ mallName }),
    capabilities: Object.fromEntries(
      CAPABILITY_KEYS.map((key) => [key, capabilities[key] ?? 'pending']),
    ) as MallCapabilities,
  });

  it('⭐ 되는 일 수가 같아도 앞 칸이 되는 몰이 위에 선다', () => {
    // 둘 다 셋씩 된다. 다른 것은 '어느 칸' 이 되느냐뿐이다.
    const tracking = rowOf('송장되는몰', { orders: 'ready', tracking: 'ready', register: 'ready' });
    const later = rowOf('뒤칸되는몰', { orders: 'ready', register: 'ready', soldout: 'ready' });

    expect(sortByCapability([later, tracking]).map((row) => row.channel.mallName))
      .toEqual(['송장되는몰', '뒤칸되는몰']);
  });

  it('⭐ 한 칸이 되는 몰끼리 붙어 선다 — 세로로 훑으면 위에서 끊기지 않는다', () => {
    const rows = [
      rowOf('가', { orders: 'ready' }),
      rowOf('나', { orders: 'ready', tracking: 'ready' }),
      rowOf('다', { orders: 'ready' }),
      rowOf('라', { orders: 'ready', tracking: 'ready' }),
      rowOf('마', { orders: 'ready', tracking: 'ready' }),
    ];
    const names = sortByCapability(rows).map((row) => row.channel.mallName);
    const trackingRows = sortByCapability(rows)
      .map((row, index) => (row.capabilities.tracking === 'ready' ? index : -1))
      .filter((index) => index >= 0);

    // 셋이 맨 위에 연달아 선다.
    expect(trackingRows).toEqual([0, 1, 2]);
    // 칸이 모두 같으면 이름순이다.
    expect(names.slice(0, 3)).toEqual(['나', '라', '마']);
  });

  it("'그 몰에 없는 일' 은 '아직 안 만든 일' 보다 아래다", () => {
    const pending = rowOf('아직', { orders: 'ready', tracking: 'pending' });
    const unavailable = rowOf('불가', { orders: 'ready', tracking: 'unavailable' });

    expect(sortByCapability([unavailable, pending]).map((row) => row.channel.mallName))
      .toEqual(['아직', '불가']);
  });
});
