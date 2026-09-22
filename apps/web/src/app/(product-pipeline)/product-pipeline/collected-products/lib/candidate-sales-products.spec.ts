import { describe, expect, it, vi } from 'vitest';
import { SalesProductCreateInputSchema, type SalesProductFromCandidatesRequest } from '@kiditem/shared/sales-product';
import {
  candidatesToSalesProducts,
  salesProductInputFromCandidate,
  type CandidateSalesProductDeps,
} from './candidate-sales-products';
import type { ProductDetailResponse } from './sourcing-api';

function detail(id: string, basics: Record<string, unknown> = {}): ProductDetailResponse {
  return {
    id,
    name: '5000과일바구니딸깍이키링',
    status: 'completed',
    sourcePlatform: '1688',
    source_platform: '1688',
    source_url: null,
    thumbnailUrl: null,
    thumbnail_url: null,
    price_krw: null,
    cost_cny: null,
    image_count: 1,
    is_processed: true,
    raw_data: null,
    processed_data: null,
    image_urls: [],
    images: [],
    contentWorkspaceId: 'ws-1',
    registrationTarget: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    basicInfo: {
      name: '과일바구니 딸깍이 키링',
      salePrice: 7900,
      originalPrice: 9900,
      keywords: ['키링', '피젯', '키링'],
      tags: [],
      colorVariantNames: '혼합',
      kcCertificationNumber: 'CB063R1234-5001',
      selectedThumbnailUrl: 'http://localhost:9000/kiditem/rep.jpg',
      thumbnailPreviewUrls: ['http://localhost:9000/kiditem/rep.jpg', 'http://localhost:9000/kiditem/add-1.jpg'],
      registrationImages: { primary: ['http://localhost:9000/kiditem/rep.jpg'], thumbnail: [], detail: [] },
      ...basics,
    } as unknown as ProductDetailResponse['basicInfo'],
  } as unknown as ProductDetailResponse;
}

describe('salesProductInputFromCandidate', () => {
  it('fills a valid single-unit sales product from the neutral mall draft', () => {
    const input = salesProductInputFromCandidate(detail('c1'), 'http://localhost:9000/kiditem/detail.jpg');
    expect(SalesProductCreateInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      name: '과일바구니 딸깍이 키링',
      originCountry: '중국',
      noticeCategory: '023',
      keywords: ['키링', '피젯'],
      certifications: [{ number: 'CB063R1234-5001' }],
      imageUrls: ['http://localhost:9000/kiditem/rep.jpg', 'http://localhost:9000/kiditem/add-1.jpg'],
      detailHtml: '<center><img src="http://localhost:9000/kiditem/detail.jpg"></center>',
      optionAxes: [],
      options: [{ values: [], salePrice: 7900, normalPrice: 9900 }],
    });
  });

  it('uses a confirmed submission price while retaining candidate images and detail content', () => {
    const input = salesProductInputFromCandidate(
      detail('c1'),
      'http://localhost:9000/kiditem/confirmed-detail.jpg',
      { name: '확정 상품명', salePrice: 15900 },
    );

    expect(input).toMatchObject({
      name: '확정 상품명',
      imageUrls: ['http://localhost:9000/kiditem/rep.jpg', 'http://localhost:9000/kiditem/add-1.jpg'],
      detailHtml: '<center><img src="http://localhost:9000/kiditem/confirmed-detail.jpg"></center>',
      options: [{ values: [], salePrice: 15900, normalPrice: null }],
    });
  });
});

describe('candidatesToSalesProducts', () => {
  function deps(overrides: Partial<CandidateSalesProductDeps> = {}): CandidateSalesProductDeps {
    return {
      getDetail: async (id) => detail(id, id === 'free' ? { salePrice: 0, originalPrice: 0 } : {}),
      renderDetailImage: async (id) => (id === 'no-detail' ? null : `http://localhost:9000/kiditem/${id}-detail.jpg`),
      createFromCandidates: vi.fn(async (body: SalesProductFromCandidatesRequest) => ({
        products: body.items.map((item, index) => ({
          candidateId: item.candidateId,
          salesProductId: `00000000-0000-4000-8000-00000000000${index}`,
          code: `K00000${index + 1}`,
          created: true,
        })),
        created: body.items.length,
        reused: 0,
      })),
      ...overrides,
    };
  }

  it('skips products without a sale price, keeps the chosen order and reports progress', async () => {
    const used = deps();
    const progress: number[] = [];
    const outcome = await candidatesToSalesProducts(['b', 'free', 'no-detail', 'b'], used, (done) => progress.push(done));
    const sent = vi.mocked(used.createFromCandidates).mock.calls[0]![0];
    expect(sent.items.map((item) => item.candidateId)).toEqual(['b', 'no-detail']);
    expect(sent.items[1]!.product.detailHtml).toBeNull();
    expect(outcome.skipped).toEqual([
      { candidateId: 'free', name: '과일바구니 딸깍이 키링', reason: '판매가가 비어 있습니다(0원). 수집상품 상세에서 판매가를 넣어 주세요.' },
    ]);
    expect(outcome.withoutDetail).toEqual(['과일바구니 딸깍이 키링']);
    expect(outcome.created).toBe(2);
    expect(progress.at(-1)).toBe(3);
  });

  it('does not call the server when nothing can become a sales product', async () => {
    const used = deps();
    const outcome = await candidatesToSalesProducts(['free'], used);
    expect(outcome.products).toEqual([]);
    expect(used.createFromCandidates).not.toHaveBeenCalled();
  });
});

describe('옵션 있는 수집상품', () => {
  it('종류를 단품으로 만든다 — 잔디인형 모양처럼 한 상품에 여러 종류', () => {
    const input = salesProductInputFromCandidate(detail('c-opt', { optionNames: ['곰', '토끼', '강아지'] }), null);
    expect(input.optionAxes).toEqual(['종류']);
    expect(input.options).toEqual([
      { values: ['곰'], salePrice: 7900, normalPrice: 9900 },
      { values: ['토끼'], salePrice: 7900, normalPrice: 9900 },
      { values: ['강아지'], salePrice: 7900, normalPrice: 9900 },
    ]);
  });

  it('종류가 없으면 옵션 없는 상품이다', () => {
    const input = salesProductInputFromCandidate(detail('c-opt', { optionNames: [] }), null);
    expect(input.optionAxes).toEqual([]);
    expect(input.options).toEqual([{ values: [], salePrice: 7900, normalPrice: 9900 }]);
  });

  it('같은 종류를 두 번 적어도 단품은 하나다', () => {
    const input = salesProductInputFromCandidate(detail('c-opt', { optionNames: ['곰', ' 곰 ', ''] }), null);
    expect(input.options).toEqual([{ values: ['곰'], salePrice: 7900, normalPrice: 9900 }]);
  });
});
