import { describe, expect, it } from 'vitest';
import { availabilityHarness } from '../mall-write/availability.fake';
import './availability';

/**
 * 카카오 톡스토어 품절 = 재고 0(2026-09-19 실측, 옛 `mall-availability-send.test.mjs` 이식). 판매자센터 상품조회의 [선택 수정]이
 * 보내는 요청 그대로 — PUT /api/tstore/products/grid/columns. 지금 값을 목록 API로 읽어 그대로 싣고 재고(가격)만 바꾼다.
 */
type Product = { id?: string; name?: string; salePrice?: number | string; storeManagementCode?: string; stockQuantity?: number; optionSetting?: string; displayStatusType?: string };

function kakaoMall({ products = {} as Record<string, Product>, landAt = undefined as string | undefined, gridStatus = 200, existingTab = null as number | null, currentUrl = undefined as string | undefined } = {}) {
  const state = new Map(Object.entries(products).map(([id, product]) => [id, {
    id, name: `상품 ${id}`, salePrice: 2220 as number | string, storeManagementCode: '', stockQuantity: 999,
    optionSetting: '미설정', displayStatusType: 'OPEN', ...product,
  }]));
  const log = { puts: [] as Array<Array<Record<string, unknown>>>, reads: [] as string[] };
  const harness = availabilityHarness({
    mallKey: 'kakao',
    ...(landAt ? { landAt: () => landAt } : {}),
    existingTab: () => existingTab,
    ...(currentUrl ? { currentUrl } : {}),
    handlers: {
      requestOnPage: (path: string, method: string, contentType: string | null, body: string | null) => {
        if (method === 'GET' && path.startsWith('/api/tstore/products?')) {
          const id = new URLSearchParams(path.split('?')[1]).get('productIds')!;
          log.reads.push(id);
          const product = state.get(id);
          return { status: 200, json: { contents: product ? [{ ...product }] : [], totalCount: product ? 1 : 0 }, preview: '', url: `https://shopping-seller.kakao.com${path}` };
        }
        if (method === 'PUT' && path === '/api/tstore/products/grid/columns') {
          expect(contentType).toBe('application/json');
          const edits = JSON.parse(body!);
          log.puts.push(edits);
          if (gridStatus === 200) {
            for (const edit of edits) Object.assign(state.get(String(edit.productId))!, { stockQuantity: edit.stockQuantity, salePrice: edit.salePrice });
          }
          return { status: gridStatus, json: gridStatus === 200 ? { successCount: edits.length } : { message: '수정할 수 없는 상품입니다' }, preview: '', url: '' };
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    },
  });
  return { ...harness, state, kakao: log };
}

describe('카카오 톡스토어 품절·재개', () => {
  it('⭐ 품절은 [선택 수정]과 같은 모양으로 재고만 0으로 — 지금 값을 그대로 싣는다', async () => {
    const { api, kakao, state, log } = kakaoMall({
      products: {
        779522307: { name: '애니멀 회전 주사위 키링', salePrice: 2220, storeManagementCode: 'ABC', displayStatusType: 'OPEN' },
        711073894: { optionSetting: '설정' },
        777184227: { stockQuantity: 0 },
      },
    });
    const result = await api.send({ codes: ['779522307', '711073894', '777184227', 'X-1'] });
    expect(kakao.puts).toEqual([[
      { name: '애니멀 회전 주사위 키링', salePrice: 2220, storeManagementCode: 'ABC', stockQuantity: 0, productId: '779522307', displayStatus: 'OPEN' },
    ]]);
    expect(state.get('779522307')!.stockQuantity).toBe(0);
    expect(state.get('711073894')!.stockQuantity).toBe(999);
    expect(result).toMatchObject({ success: true, sent: 2, confirmed: 2, failed: 2, already: 1 });
    expect(result.warnings!.some((warning) => warning.includes('옵션이 있는 상품 1개'))).toBe(true);
    expect(log).toContain('close 7');
  });

  it('해제는 재고 0인 상품만 999로 — 재고가 남은 상품은 낮추지 않는다', async () => {
    const { api, kakao } = kakaoMall({ products: { 1: { stockQuantity: 0 }, 2: { stockQuantity: 5 } } });
    const result = await api.send({ codes: ['1', '2'], resume: true });
    expect(kakao.puts.map((edits) => edits.map((edit) => [edit.productId, edit.stockQuantity]))).toEqual([[['1', 999]]]);
    expect(result).toMatchObject({ sent: 2, confirmed: 2 });
  });

  it('열린 판매자센터 화면이 있으면 그 화면을 빌려 쓰고 닫지 않는다 · 거절하면 몰이 한 말을 싣는다', async () => {
    const reused = kakaoMall({ products: { 1: {} }, existingTab: 5, currentUrl: 'https://shopping-seller.kakao.com/product/store-seller/list' });
    await reused.api.send({ codes: ['1'] });
    expect(reused.log.filter((line) => line.startsWith('open '))).toEqual([]);
    expect(reused.log).toContain('keep 5');

    const refused = kakaoMall({ products: { 1: {} }, gridStatus: 400 });
    const result = await refused.api.send({ codes: ['1'] });
    expect(result).toMatchObject({ failed: 1, confirmed: 0 });
    expect(result.warnings!.some((warning) => warning.includes('수정할 수 없는 상품입니다'))).toBe(true);
  });

  it('로그인 화면이면 아무것도 보내지 않고 SITE_LOGIN_REQUIRED로 탭을 남긴다(로그인 입구 명세 없음)', async () => {
    const { api, kakao, log } = kakaoMall({ products: { 1: {} }, landAt: 'https://accounts.kakao.com/login' });
    await expect(api.send({ codes: ['1'] })).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    expect(kakao.puts).toHaveLength(0);
    expect(log).not.toContain('close 7');
  });

  it('지금 재고 읽기 — 상품마다 재고 수', async () => {
    const { api } = kakaoMall({ products: { 1: { stockQuantity: 0 }, 2: { stockQuantity: 12 } } });
    expect(await api.read({ codes: ['1', '2', '3'] })).toEqual({
      success: true,
      products: [
        { code: '1', options: [{ optionCode: '1', stock: 0, rocket: false }] },
        { code: '2', options: [{ optionCode: '2', stock: 12, rocket: false }] },
      ],
      missing: ['3'],
    });
  });
});

describe('카카오 톡스토어 가격', () => {
  it('⭐ [선택 수정]과 같은 모양으로 판매가만 바꾼다 — 재고·이름·전시상태는 읽은 그대로, 다시 읽어 확인', async () => {
    const { api, kakao, state, log } = kakaoMall({
      products: {
        779522307: { name: '애니멀 회전 주사위 키링', salePrice: 2220, storeManagementCode: 'ABC', stockQuantity: 37 },
        711073894: { optionSetting: '설정' },
        700000001: { salePrice: 1500 },
      },
    });
    const result = await api.sendPrice({ items: [{ code: '779522307', price: 2500 }, { code: '711073894', price: 3000 }, { code: '700000001', price: 1500 }, { code: 'X-1', price: 1000 }] });
    expect(kakao.puts).toEqual([[
      { name: '애니멀 회전 주사위 키링', salePrice: 2500, storeManagementCode: 'ABC', stockQuantity: 37, productId: '779522307', displayStatus: 'OPEN' },
      { name: '상품 700000001', salePrice: 1500, storeManagementCode: '', stockQuantity: 999, productId: '700000001', displayStatus: 'OPEN' },
    ]]);
    expect(state.get('779522307')!.stockQuantity).toBe(37);
    expect(state.get('711073894')!.salePrice).toBe(2220);
    expect(result).toMatchObject({ success: true, sent: 2, confirmed: 2, failed: 2, submissionAttempted: true });
    expect(result.results).toEqual([
      { code: '779522307', before: 2220, after: 2500, confirmed: true, observedUrl: 'https://shopping-seller.kakao.com/product/store-seller/list' },
      { code: '700000001', before: 1500, after: 1500, confirmed: true, observedUrl: 'https://shopping-seller.kakao.com/product/store-seller/list' },
    ]);
    expect(result.warnings!.some((warning) => warning.includes('옵션이 있는 상품 1개'))).toBe(true);
    expect(log).toContain('close 7');
  });

  it('0원·억 단위 같은 값은 아무것도 보내지 않고 거절한다', async () => {
    const { api, kakao, log } = kakaoMall({ products: { 1: {} } });
    expect((await api.sendPrice({ items: [{ code: '1', price: 0 }] })).success).toBe(false);
    expect((await api.sendPrice({ items: [{ code: '1', price: 120000000 }] })).success).toBe(false);
    expect(kakao.puts).toHaveLength(0);
    expect(log).toEqual([]);
  });

  it('화면이 본 몰 가격(ifPrice)과 지금 몰 가격이 다르면 덮어쓰지 않는다 · 사전 조건에서 멈추면 보낸 것이 아니다', async () => {
    const { api, kakao } = kakaoMall({ products: { 1: { salePrice: 990 }, 2: { salePrice: 950 } } });
    const result = await api.sendPrice({ items: [{ code: '1', price: 950, ifPrice: 950 }, { code: '2', price: 950, ifPrice: 950 }] });
    expect(kakao.puts.map((edits) => edits.map((edit) => [edit.productId, edit.salePrice]))).toEqual([[['2', 950]]]);
    expect(result.failed).toBe(1);
    expect(result.warnings!.some((warning) => warning.includes('990원으로 바뀌어'))).toBe(true);

    const skipped = kakaoMall({ products: { 1: { salePrice: 990 } } });
    expect((await skipped.api.sendPrice({ items: [{ code: '1', price: 1000, ifPrice: 950 }] })).submissionAttempted).toBe(false);
    const rejected = kakaoMall({ products: { 1: { salePrice: 990 } }, gridStatus: 500 });
    expect((await rejected.api.sendPrice({ items: [{ code: '1', price: 1000 }] })).submissionAttempted).toBe(true);
  });

  it('빌린 탭이 몰 밖 주소면 그 주소를 결과에 싣지 않는다', async () => {
    const foreign = kakaoMall({ products: { 2: { salePrice: 990 } }, existingTab: 5, currentUrl: 'https://example.test/foreign-price' });
    // 가드가 몰 밖 탭에서 부르지 않는다 — 빌린 탭이 몰 밖이면 실행이 멈춘다.
    await expect(foreign.api.sendPrice({ items: [{ code: '2', price: 1000 }] })).rejects.toMatchObject({ details: { reason: 'unexpected_url' } });
  });
});
