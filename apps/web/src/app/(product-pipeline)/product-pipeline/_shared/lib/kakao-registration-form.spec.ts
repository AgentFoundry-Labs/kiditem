import { describe, expect, it } from 'vitest';
import {
  KAKAO_CAUTION,
  KAKAO_DELIVERY_TEMPLATE,
  KAKAO_MAX_IMAGES,
  KAKAO_NAME_MAX,
  KAKAO_REGISTER_URL,
  buildKakaoProductName,
  kakaoFormFromDraft,
  kakaoOrigin,
  parseKakaoCategory,
} from './kakao-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 카카오 톡스토어 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-18)에서 왔다.
 *   793407891 상품명 `포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼` · 판매가 2850 · 재고 999 · 브랜드 kiditem
 *             원산지 수입산:아시아:중국 · KC [어린이제품] 안전확인 CB065R1010-26001 · 고시 어린이제품
 *             (품명 `4500포도설기말랑이` · 제조자 해피프랜즈 · 제조국 중국 · 주의사항 3줄 · A/S 031-908-5401)
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'b3fab6af-07b5-49b1-ac9d-8e9b208dee20',
  displayName: '포도 설기 말랑이',
  sellerProductName: '4500포도설기말랑이',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['주물럭', '슬랑이', '스트레스볼', '찐득볼'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/rep.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  notice: {
    category: '어린이제품',
    fields: {
      품명및모델명: '상세페이지 참조',
      KC인증: '상세정보 별도표기',
      사용연령: '8세 이상',
      제조자: '해피프랜즈',
      제조국: '중국',
      취급방법및주의사항: '상세페이지 참조',
      품질보증기준: '상세페이지 참조',
      AS책임자: '031-908-5401',
    },
  },
  variants: [
    {
      options: [],
      salePrice: 2850,
      listPrice: 2850,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('톡스토어 상품명', () => {
  it('이름 Np 키워드 — 실측 등록물과 글자 하나 다르지 않다', () => {
    expect(buildKakaoProductName('포도 설기 말랑이', ['주물럭', '슬랑이', '스트레스볼', '찐득볼'], 1))
      .toBe('포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼');
  });

  it('⭐ 화면이 자르는 70자를 넘기지 않는다 — 뒤 키워드부터 빼고, 이름이 넘치면 자르되 Np 는 남긴다', () => {
    const many = buildKakaoProductName('말랑이', Array.from({ length: 10 }, (_, i) => `키워드${i}번째단어`), 2);
    expect([...many].length).toBeLessThanOrEqual(KAKAO_NAME_MAX);
    expect(many.startsWith('말랑이 2p 키워드0번째단어')).toBe(true);
    const long = buildKakaoProductName('가'.repeat(90), [], 3);
    expect([...long].length).toBeLessThanOrEqual(KAKAO_NAME_MAX);
    expect(long.endsWith(' 3p')).toBe(true);
  });

  it('수집 원본명 앞의 소비자가와 꺾쇠를 뗀다', () => {
    expect(buildKakaoProductName('4500포도 <설기>', [], 1)).toBe('포도 설기 1p');
  });
});

describe('톡스토어 카테고리 · 원산지', () => {
  it('카테고리 코드는 세 자리씩 붙는 숫자만 받는다', () => {
    expect(parseKakaoCategory(' 102106101109 ')).toBe('102106101109');
    expect(parseKakaoCategory('102106111111')).toBe('102106111111');
    expect(parseKakaoCategory('1021061011')).toBeNull();
    expect(parseKakaoCategory('클레이')).toBeNull();
    expect(parseKakaoCategory('')).toBeNull();
  });

  it('제조국을 톡스토어 목록 글자(구분 › 지역 › 나라)로 옮긴다', () => {
    expect(kakaoOrigin('중국')).toEqual({ type: '수입산', region: '아시아', country: '중국' });
    expect(kakaoOrigin('미국')).toEqual({ type: '수입산', region: '북아메리카(북미)', country: '미국' });
    expect(kakaoOrigin('대한민국')).toEqual({ type: '국내산', region: '', country: '' });
    // 모르는 나라는 지역을 비워 사람이 고르게 한다 — 엉뚱한 나라를 고르지 않는다.
    expect(kakaoOrigin('칠레')).toEqual({ type: '수입산', region: '', country: '' });
    expect(kakaoOrigin(undefined)).toEqual({ type: '수입산', region: '아시아', country: '중국' });
  });
});

describe('톡스토어 폼', () => {
  it('⭐ 실측 등록물과 같은 값으로 채운다', () => {
    const form = kakaoFormFromDraft(draft(), { quantity: 1, categoryId: '102106101109', certNumber: 'CB065R1010-26001' });
    expect(form.url).toBe(KAKAO_REGISTER_URL);
    expect(form.kakao).toMatchObject({
      productName: '포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼',
      categoryId: '102106101109',
      salePrice: 2850,
      stock: 999,
      origin: { type: '수입산', region: '아시아', country: '중국' },
      cert: { type: '[어린이제품] 안전확인', number: 'CB065R1010-26001' },
      deliveryTemplate: KAKAO_DELIVERY_TEMPLATE,
      brand: 'kiditem',
      manufacturer: '해피프랜즈',
      affiliate: false,
    });
    expect(form.kakao.notice).toEqual({
      group: '어린이제품',
      values: {
        '품명 및 모델명': '4500포도설기말랑이',
        'KC 인증정보': '[어린이제품] 안전확인 CB065R1010-26001',
        사용연령: '8세 이상',
        제조자: '해피프랜즈',
        제조국: '중국',
        취급방법: KAKAO_CAUTION,
        'A/S 책임자': '031-908-5401',
      },
    });
  });

  it('⭐ 상세페이지 참조 · 별도표기 값은 치지 않는다 — 그 줄은 확장이 `상품상세설명 참조` 로 둔다', () => {
    const { kakao } = kakaoFormFromDraft(draft());
    expect(kakao.notice.values).not.toHaveProperty('KC 인증정보');
    expect(kakao.notice.values).not.toHaveProperty('품질보증기준');
    expect(Object.values(kakao.notice.values).some((value) => /참조|별도/.test(value))).toBe(false);
    expect(kakao.cert).toBeNull();
  });

  it('카테고리를 비우면 AI 추천으로 고르라고 비워 두고, 사람에게 확인하라고 적는다', () => {
    const form = kakaoFormFromDraft(draft(), { categoryId: '클레이' });
    expect(form.kakao.categoryId).toBe('');
    expect(form.manualSteps[0]).toContain('AI 추천');
    expect(form.manualSteps.at(-1)).toContain('[저장하기]');
  });

  it('대표 + 추가 최대 5장, 겹치는 사진은 한 번만', () => {
    const extra = Array.from({ length: 8 }, (_, i) => `https://cdn.example.com/x${i}.jpg`);
    const form = kakaoFormFromDraft(draft({ additionalImageUrls: ['https://cdn.example.com/rep.jpg', ...extra] }));
    expect(form.imageGroups.kakao).toHaveLength(KAKAO_MAX_IMAGES);
    expect(form.imageGroups.kakao[0]).toBe('https://cdn.example.com/rep.jpg');
    expect(new Set(form.imageGroups.kakao).size).toBe(KAKAO_MAX_IMAGES);
    expect(form.detailUploads).toEqual([{ url: 'http://localhost:9000/kiditem/detail.jpg' }]);
  });

  it('상품에 브랜드가 따로 있으면 그걸 쓴다', () => {
    expect(kakaoFormFromDraft(draft({ brand: '포켓몬' })).kakao.brand).toBe('포켓몬');
  });
});
