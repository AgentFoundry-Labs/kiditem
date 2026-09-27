import { describe, expect, it } from 'vitest';
import { runAvailability } from '../mall-write/availability';
import { availabilityHarness } from '../mall-write/availability.fake';
import './availability';

/**
 * 쿠팡 윙 품절 = 옵션 재고수량 0(실측 2026-09-18, 옛 `mall-availability-send.test.mjs` 이식). 옵션 목록을 읽어
 * `vendorInventoryItemId`를 얻고, 품절 옵션만 `stock-manager/remain-change/request`에 `stockManageItems={dtos}`로 보낸 뒤 다시
 * 읽는다. 옛 "앞에 띄운 상품목록" 스펙은 실행 계약에 없어 옮기지 않았다.
 */
const ITEMS_PATH = '/tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/';
const WING_LIST = 'https://wing.coupang.com/vendor-inventory/list';
const CHANGE_PATH = '/tenants/seller-web/vendorinventory/stock-manager/remain-change/request';

type Item = { vendorItemId: number; stockQuantity: number | null; registrationType?: string | null; vendorInventoryItemId?: number };

function wingMall({
  providerIdentity = 'vendor-1' as string,
  identityAfter = providerIdentity as string,
  products = {} as Record<string, Item[]>,
  reject = {} as Record<string, string>,
  itemsStatus = 200,
  throttle = { reads: 0, posts: 0 },
  lagReads = 0,
  landAt = undefined as string | undefined,
  existingTab = null as number | null,
} = {}) {
  const state = new Map(Object.entries(products).map(([id, items]) => [id, items.map((item, index) => ({
    vendorInventoryItemId: Number(`7${id.slice(-6)}${index}`),
    registrationType: 'NORMAL' as string | null,
    status: 'APPROVED',
    ...item,
  }))]));
  const log = { reads: [] as string[], changes: [] as Array<Array<Record<string, unknown>>> };
  const limits = { reads: throttle.reads ?? 0, posts: throttle.posts ?? 0 };
  let stale: { id: string; left: number; items: Item[] } | null = null;
  let identityReads = 0;
  const harness = availabilityHarness({
    mallKey: 'coupang',
    ...(landAt ? { landAt: () => landAt } : {}),
    existingTab: () => existingTab,
    ...(existingTab !== null ? { currentUrl: 'https://wing.coupang.com/tenants/cs/product/review' } : {}),
    handlers: {
      wingIdentityOnPage: (expected: string) => {
        const vendorId = identityReads++ === 0 ? providerIdentity : identityAfter;
        return { ok: vendorId === expected, vendorId };
      },
      requestOnPage: (path: string, method: string, contentType: string | null, body: string | null) => {
        const tooMany = { status: 429, json: null, preview: '<html>Too Many Requests</html>', url: `https://wing.coupang.com${path}` };
        if (method === 'GET' && path.startsWith(ITEMS_PATH)) {
          const id = path.slice(ITEMS_PATH.length).split('?')[0]!;
          log.reads.push(id);
          if (limits.reads > 0) {
            limits.reads -= 1;
            return tooMany;
          }
          let items: Item[] | undefined = state.get(id);
          if (stale && stale.id === id && stale.left > 0) {
            stale.left -= 1;
            items = stale.items;
          }
          const json = itemsStatus === 200 && items ? { success: true, data: items.map((item) => ({ ...item })) } : null;
          return { status: itemsStatus === 200 && !items ? 404 : itemsStatus, json, preview: json ? '' : '<html>', url: `https://wing.coupang.com${path}` };
        }
        if (method === 'POST' && path === CHANGE_PATH) {
          expect(contentType).toMatch(/^application\/x-www-form-urlencoded/);
          expect(body!.startsWith('stockManageItems=')).toBe(true);
          if (limits.posts > 0) {
            limits.posts -= 1;
            return tooMany;
          }
          const { dtos } = JSON.parse(decodeURIComponent(body!.slice('stockManageItems='.length)));
          log.changes.push(dtos);
          const results = dtos.map((dto: { vendorItemId: number; inventoryQuantity: number }) => {
            const refused = reject[String(dto.vendorItemId)];
            if (!refused) {
              for (const [id, items] of state.entries()) {
                const item = items.find((candidate) => candidate.vendorItemId === dto.vendorItemId);
                if (item) {
                  if (lagReads > 0 && !stale) stale = { id, left: lagReads, items: items.map((entry) => ({ ...entry })) };
                  item.stockQuantity = dto.inventoryQuantity;
                }
              }
            }
            return { vendorItemId: dto.vendorItemId, success: !refused, message: refused || null, inventoryQuantity: dto.inventoryQuantity };
          });
          return { status: 200, json: results, preview: '', url: `https://wing.coupang.com${path}` };
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    },
  });
  return { ...harness, state, wing: log };
}

describe('쿠팡 윙 품절·재개', () => {
  it('⭐ 짚은 옵션만 재고 0으로 — 윙 재고수량 칸이 보내는 모양 그대로, 윙 상품목록을 뒤에서 열고 닫는다', async () => {
    const { api, wing, state, log } = wingMall({
      products: {
        15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }, { vendorItemId: 94489536459, stockQuantity: 998 }],
        16389409095: [{ vendorItemId: 96075239894, stockQuantity: 0 }],
      },
    });
    const result = await api.send({ codes: ['15966710321', '16389409095', 'ABC-1'], options: { 15966710321: ['94489536455'] } });

    const opened = log.filter((line) => line.startsWith('navigate '));
    expect(opened).toHaveLength(1);
    expect(opened[0]!.startsWith(`navigate ${WING_LIST}?searchKeywordType=ALL&searchKeywords=&`)).toBe(true);
    expect(wing.changes).toEqual([[{ vendorInventoryItemId: 77103210, vendorItemId: 94489536455, inventoryQuantity: 0 }]]);
    expect(state.get('15966710321')![1]!.stockQuantity).toBe(998);
    expect(result).toMatchObject({ success: true, sent: 2, confirmed: 2, failed: 1, already: 1, rocket: 0 });
    expect(result.warnings).toContain('1건은 쿠팡 윙 등록상품ID 모양이 아니라 보내지 않았습니다.');
    expect(result.stopped).toBeUndefined();
    expect(log).toContain('close 7');
  });

  it('해제는 재고 0인 옵션에만 재고 999를 넣고, 재고가 남은 옵션은 낮추지 않는다', async () => {
    const { api, wing, state } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 0 }, { vendorItemId: 94489536459, stockQuantity: 1861 }] } });
    const result = await api.send({ codes: ['15966710321'], resume: true });
    expect(wing.changes).toEqual([[{ vendorInventoryItemId: 77103210, vendorItemId: 94489536455, inventoryQuantity: 999 }]]);
    expect(state.get('15966710321')![1]!.stockQuantity).toBe(1861);
    expect(result).toMatchObject({ sent: 2, confirmed: 2, already: 1 });
  });

  it('윙이 429로 막으면 쉬었다 같은 요청을 다시 보낸다 — 로그아웃으로 읽지 않는다', async () => {
    const { api, wing, sleeps } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] }, throttle: { reads: 2, posts: 1 } });
    const result = await api.send({ codes: ['15966710321'] });
    expect(result).toMatchObject({ success: true, sent: 1, confirmed: 1, failed: 0 });
    expect(wing.changes).toHaveLength(1);
    expect(sleeps.filter((ms) => ms >= 5000)).toEqual([5000, 15000, 5000]);
  });

  it('윙이 끝까지 429로 막으면 거기서 멈추고 남은 상품은 보내지 못한 것으로 센다', async () => {
    const { api, wing, log } = wingMall({
      products: {
        15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }],
        16389409095: [{ vendorItemId: 96075239894, stockQuantity: 999 }, { vendorItemId: 96075239895, stockQuantity: 999 }],
        16389409096: [{ vendorItemId: 96075239896, stockQuantity: 999 }],
      },
      throttle: { reads: 100, posts: 0 },
    });
    const result = await api.send({ codes: ['15966710321', '16389409095', '16389409096'], options: { 16389409095: ['96075239894', '96075239895'] } });
    expect(result).toMatchObject({ success: true, stopped: 'rate_limited', sent: 0, failed: 4 });
    expect(wing.changes).toHaveLength(0);
    expect(wing.reads).toHaveLength(4);
    expect(result.warnings!.some((warning) => warning.includes('HTTP 429') && warning.includes('상품 3개는 보내지 못했습니다'))).toBe(true);
    expect(log).toContain('close 7');
  });

  it('윙이 받은 뒤 늦게 반영하면 한 번 더 읽어 확인한다', async () => {
    const { api, wing, sleeps } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] }, lagReads: 1 });
    const result = await api.send({ codes: ['15966710321'] });
    expect(result).toMatchObject({ sent: 1, confirmed: 1 });
    expect(wing.reads).toHaveLength(3);
    expect(sleeps).toContain(1500);
  });

  it('윙이 거절한 옵션은 실패로 세고 윙이 한 말을 싣는다 — 로켓그로스 옵션은 건너뛴다', async () => {
    const { api } = wingMall({
      products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }, { vendorItemId: 94489536459, stockQuantity: 999, registrationType: 'RFM' }] },
      reject: { 94489536455: '판매중지된 옵션은 재고를 바꿀 수 없습니다' },
    });
    const result = await api.send({ codes: ['15966710321'] });
    expect(result).toMatchObject({ sent: 0, failed: 1, confirmed: 0, rocket: 1 });
    expect(result.warnings!.some((warning) => warning.includes('판매중지된 옵션은 재고를 바꿀 수 없습니다'))).toBe(true);
  });

  it('윙 로그인 화면으로 넘어가면(실행 자격 없음) 아무것도 보내지 않고 SITE_LOGIN_REQUIRED로 탭을 남긴다', async () => {
    const { api, wing, log } = wingMall({
      landAt: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth',
      products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] },
    });
    await expect(api.send({ codes: ['15966710321'] })).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    expect(wing.changes).toHaveLength(0);
    expect(log).not.toContain('close 7');
  });

  it('윙에 없는 옵션코드는 실패로 센다 · 옵션 목록이 비어 오면 조용히 넘기지 않는다', async () => {
    const { api, wing } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] } });
    const result = await api.send({ codes: ['15966710321'], options: { 15966710321: ['11111111111'] } });
    expect(wing.changes).toHaveLength(0);
    expect(result.failed).toBe(1);
    expect(result.warnings!.some((warning) => warning.includes('옵션 1개가 쿠팡 윙에 없습니다'))).toBe(true);

    const empty = wingMall({ products: { 111: [] } });
    const none = await empty.api.send({ codes: ['111'] });
    expect(none.failed).toBe(1);
    expect(none.warnings!.some((warning) => /옵션 목록이 비어/.test(warning))).toBe(true);
  });

  it('보내기에서 끝까지 막히면 그 상품부터 보내지 못한 것으로 센다', async () => {
    const { api, wing } = wingMall({
      products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }], 16389409095: [{ vendorItemId: 96075239894, stockQuantity: 999 }] },
      throttle: { reads: 0, posts: 100 },
    });
    const result = await api.send({ codes: ['15966710321', '16389409095'] });
    expect(result).toMatchObject({ stopped: 'rate_limited', sent: 0, failed: 2 });
    expect(wing.reads).toHaveLength(1);
    expect(result.warnings!.some((warning) => warning.includes('상품 2개는 보내지 못했습니다'))).toBe(true);
  });

  it('이미 열린 로그인된 윙 탭이 있으면 그 탭에서 부르고 닫지 않는다', async () => {
    const { api, log } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] }, existingTab: 9 });
    await api.send({ codes: ['15966710321'] });
    expect(log).toContain('find https://wing.coupang.com/*');
    expect(log.filter((line) => line.startsWith('navigate '))).toEqual([]);
    expect(log).toContain('keep 9');
  });
});

describe('쿠팡 윙 — 계정 대조와 증거', () => {
  it('실행 계정이 화면 계정과 같으면 다시 읽은 일반 옵션 재고와 계정을 증거로 싣는다', async () => {
    const { api, wing } = wingMall({ products: { 123: [{ vendorItemId: 456, stockQuantity: 9 }] } });
    const result = await api.send({ codes: ['123'], options: { 123: ['456'] }, expectedProviderAccountId: 'vendor-1' });
    expect(wing.changes[0]![0]!.inventoryQuantity).toBe(0);
    expect(result.observed).toEqual([{ code: '123', options: [{ optionCode: '456', stock: 0, rocket: false }] }]);
    expect(result.providerAccountId).toBe('vendor-1');
  });

  it('계정이 다르면 보내지 않고, 보낸 뒤 계정이 바뀌면 증거를 싣지 않는다', async () => {
    const other = wingMall({ providerIdentity: 'other', products: { 123: [{ vendorItemId: 456, stockQuantity: 9 }] } });
    const refused = await other.api.send({ codes: ['123'], expectedProviderAccountId: 'vendor-1' });
    expect(refused.success).toBe(false);
    expect(other.wing.changes).toHaveLength(0);

    const drift = wingMall({ identityAfter: 'other', products: { 123: [{ vendorItemId: 456, stockQuantity: 9 }] } });
    const drifted = await drift.api.send({ codes: ['123'], expectedProviderAccountId: 'vendor-1' });
    expect(drifted.observed).toEqual([]);
  });

  it('로켓그로스·분류를 모르는 옵션·재고를 모르는 옵션은 증거에 싣지 않는다(일반 재고 0을 지어내지 않는다)', async () => {
    const { api } = wingMall({ products: { 123: [
      { vendorItemId: 456, stockQuantity: 0, registrationType: 'RFM' },
      { vendorItemId: 457, stockQuantity: 0, registrationType: null },
      { vendorItemId: 458, stockQuantity: null },
    ] } });
    const result = await api.send({ codes: ['123'], expectedProviderAccountId: 'vendor-1' });
    expect(result.observed![0]!.options).toEqual([]);
  });

  it('실행: 증거는 보내기가 다시 읽은 것이고(한 번 더 읽지 않는다) 계정과 함께 돌려준다', async () => {
    const { module, context, wing } = wingMall({ products: { 123: [{ vendorItemId: 456, stockQuantity: 9 }] } });
    const run = await runAvailability(module, context, { resume: false, byOption: true, listings: [{ externalListingId: '123', externalOptionIds: ['456'] }], expectedProviderAccountId: 'vendor-1' });
    expect(run.observed).toEqual([{ externalListingId: '123', status: null, options: [{ externalOptionId: '456', stock: 0, status: null }] }]);
    expect(run.providerAccountId).toBe('vendor-1');
    expect(wing.reads).toHaveLength(2);
  });
});

describe('쿠팡 윙 지금 재고 읽기', () => {
  it('⭐ 윙을 뒤에서 열어 옵션 재고만 읽고, 아무것도 보내지 않는다', async () => {
    const { api, wing, log } = wingMall({
      products: {
        16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }],
        15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }, { vendorItemId: 94489536459, stockQuantity: 5, registrationType: 'RFM' }],
      },
    });
    const result = await api.read({ codes: ['16340985357', '15966710321', '99999999999', 'ABC'] });
    expect(result).toEqual({
      success: true,
      products: [
        { code: '16340985357', options: [{ optionCode: '95903875495', stock: 0, rocket: false }] },
        { code: '15966710321', options: [{ optionCode: '94489536455', stock: 999, rocket: false }, { optionCode: '94489536459', stock: 5, rocket: true }] },
      ],
      missing: ['99999999999'],
    });
    expect(wing.changes).toHaveLength(0);
    expect(log).toContain('close 7');
  });

  it('재고를 숫자로 읽지 못한 옵션은 NaN이 아니라 모름(null)이다', async () => {
    const { api } = wingMall({ products: { 16340985357: [{ vendorItemId: 1, stockQuantity: null }, { vendorItemId: 2, stockQuantity: 'N/A' as unknown as number }, { vendorItemId: 3, stockQuantity: 7 }] } });
    const result = await api.read({ codes: ['16340985357'] });
    expect(result.success && result.products[0]!.options.map((option) => option.stock)).toEqual([null, null, 7]);
  });

  it('윙이 막으면 그렇게 답한다 · 한 번에 50개까지 읽는다', async () => {
    const blocked = wingMall({ products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] }, throttle: { reads: 100, posts: 0 } });
    const limited = await blocked.api.read({ codes: ['16340985357'] });
    expect(limited.success).toBe(false);
    expect((limited as { error: string }).error).toMatch(/HTTP 429/);

    const products = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [String(16000000000 + index), [{ vendorItemId: 90000000000 + index, stockQuantity: index % 2 }]]));
    const many = wingMall({ products });
    const result = await many.api.read({ codes: Object.keys(products) });
    expect(result.success && result.products.length).toBe(50);
    expect(many.wing.reads).toHaveLength(50);
  });
});
