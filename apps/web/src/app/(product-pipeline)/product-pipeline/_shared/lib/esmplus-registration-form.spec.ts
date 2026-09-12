import { describe, expect, it } from 'vitest';
import {
  ESMPLUS_AS_PHONE,
  ESMPLUS_CERT_TYPE,
  ESMPLUS_MAX_IMAGES,
  ESMPLUS_NOTICE_GROUP,
  ESMPLUS_OPTIONAL_SECTIONS,
  ESMPLUS_REGISTER_URL,
  ESMPLUS_RETURN_FEE,
  ESMPLUS_STOCK,
  buildEsmplusNotice,
  buildEsmplusProductName,
  esmplusCategoryQuery,
  esmplusCertChoices,
  esmplusFormFromDraft,
} from './esmplus-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * ESM Plus(G마켓 · 옥션) 폼 빌더.
 *
 * 기대값은 **실측 등록물**(`goodsNo=6548340498`)과 **빈 폼 실측**(2026-09-11)에서 왔다.
 *   상품명 `할로윈 LED 거미줄 1p 불빛 장식` · 판매가 2,590 · 재고 999
 *   고시 `officialNoticeNo 35`, `35-5 = 고객센터 031-908-5401`
 *   빈 폼: 반품배송비만 0 으로 열리고, 인증 셋은 `인증대상` 으로 열린다
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '2590할로윈LED거미줄',
  sellerProductName: '2590할로윈LED거미줄',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['불빛', '장식'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
  detailImageUrls: ['https://kiditem.diskn.com/2mzzbLYEQe'],
  notice: {
    category: '어린이제품',
    fields: {
      품명및모델명: '할로윈 LED 거미줄',
      크기: '90x90cm',
      색상: '화이트',
      재질: '폴리에스터',
      사용연령: '8세 이상',
      제조자: '해피프랜즈',
      제조국: '중국',
    },
  },
  variants: [
    {
      options: [],
      salePrice: 2590,
      listPrice: 2590,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: '파티용품',
  ...overrides,
});

describe('buildEsmplusProductName', () => {
  it('앞의 소비자가를 떼고 수량을 중간에 `1p` 로 넣는다 — 실측 등록물과 같은 규칙', () => {
    expect(buildEsmplusProductName('2590할로윈LED거미줄', ['불빛', '장식'], 1)).toBe(
      '할로윈LED거미줄 1p 불빛 장식',
    );
  });

  it('키워드는 세 개까지만 붙인다', () => {
    const name = buildEsmplusProductName('거미줄', ['가', '나', '다', '라'], 2);
    expect(name).toBe('거미줄 2p 가 나 다');
  });
});

describe('esmplusCategoryQuery', () => {
  it('전체 경로의 마지막 마디에서 첫 낱말만 쓴다 — 띄어쓴 이름으로 치면 0건이 나온다', () => {
    expect(esmplusCategoryQuery('이벤트/파티용품>기타이벤트/파티용품')).toBe('기타이벤트');
    expect(esmplusCategoryQuery('완구/취미>보드게임 세트')).toBe('보드게임');
  });
});

describe('buildEsmplusNotice', () => {
  it('화면에 찍힌 제목 그대로를 키로 쓴다 — 칸에 이름이 없어 이 글자로 찾는다', () => {
    const rows = buildEsmplusNotice(draft());
    expect(rows['품명 및 모델명']).toBe('할로윈 LED 거미줄');
    expect(rows['크기/중량']).toBe('90x90cm');
    expect(rows['사용연령 또는 권장사용연령']).toBe('8세 이상');
    expect(rows['제조자/수입자']).toBe('해피프랜즈');
  });

  it('A/S 전화번호는 실측 등록물의 번호를 쓴다', () => {
    expect(buildEsmplusNotice(draft())['A/S 책임자와 전화번호']).toBe(ESMPLUS_AS_PHONE);
    expect(ESMPLUS_AS_PHONE).toBe('031-908-5401');
  });

  it('초안에 없는 줄은 넣지 않는다 — 빈 값을 밀어 넣으면 채운 것으로 세어진다', () => {
    const rows = buildEsmplusNotice(
      draft({ notice: { category: '어린이제품', fields: { 품명및모델명: '거미줄' } } }),
    );
    expect(rows.색상).toBeUndefined();
    expect(rows.재질).toBeUndefined();
  });

  it('품명이 비면 상품명으로 메운다 — 고시에서 제일 먼저 보는 줄이다', () => {
    const rows = buildEsmplusNotice(draft({ notice: { category: '어린이제품', fields: {} } }));
    expect(rows['품명 및 모델명']).toBe('2590할로윈LED거미줄');
  });
});

describe('esmplusCertChoices', () => {
  /**
   * ⚠️ 회귀(라이브 실측 2026-09-11): 분류를 고르면 `인증정보` 패널이 셋으로 다시
   * 그려지고 전부 `인증대상`/`허가 대상` 으로 되돌아간다. 그대로 두면 `인증 유형`·
   * `업종` 이 필수로 따라 열려 등록이 막힌다.
   */
  it('번호가 없으면 인증 셋을 기본값에서 치운다', () => {
    const { radios, fields, dropdowns } = esmplusCertChoices('');
    expect(radios['어린이제품 인증']).toBe('상세설명에 별도표기');
    expect(radios['G마켓 인증정보']).toBe('상세설명에 별도표기');
    expect(radios['G마켓 영업허가증']).toBe('허가 대상이 아님');
    expect(fields).toEqual({});
    expect(dropdowns).toEqual({});
  });

  it('번호가 있으면 인증대상 + 유형 + 번호까지 채운다', () => {
    const { radios, fields, dropdowns } = esmplusCertChoices(' CB123456 ');
    expect(radios['어린이제품 인증']).toBe('인증대상');
    expect(fields['인증 유형']).toBe('CB123456');
    expect(dropdowns['인증 유형']).toBe(ESMPLUS_CERT_TYPE);
  });

  it('영업허가증은 번호가 있어도 허가 대상이 아니다 — 완구는 허가 업종이 아니다', () => {
    expect(esmplusCertChoices('CB1').radios['G마켓 영업허가증']).toBe('허가 대상이 아님');
  });

  /**
   * ⭐ 어느 인증 블록이 그려질지는 **분류가 정한다.** 없는 칸을 못 찾았다고 경고하면
   * 매번 거짓 경보가 뜨고 진짜 경고가 묻힌다.
   */
  it('⭐ 인증 칸은 없어도 경고하지 않는 목록에 들어 있다', () => {
    for (const title of Object.keys(esmplusCertChoices('').radios)) {
      expect(ESMPLUS_OPTIONAL_SECTIONS).toContain(title);
    }
    expect(esmplusFormFromDraft(draft()).optionalSections).toBe(ESMPLUS_OPTIONAL_SECTIONS);
  });
});

describe('esmplusFormFromDraft', () => {
  it('껍데기가 아니라 폼 주소로 연다', () => {
    expect(esmplusFormFromDraft(draft()).url).toBe(ESMPLUS_REGISTER_URL);
    expect(ESMPLUS_REGISTER_URL).toBe('https://item.esmplus.com/goods/new');
  });

  it('섹션 제목을 키로 쓴다 — 이 몰은 칸에 name 도 id 도 없다', () => {
    const form = esmplusFormFromDraft(draft(), { quantity: 1 });
    expect(form.sectionFields.상품명).toBe('할로윈LED거미줄 1p 불빛 장식');
    expect(form.sectionFields.판매가).toBe('2590');
    expect(form.sectionFields.재고수량).toBe(String(ESMPLUS_STOCK));
  });

  /** ⚠️ 회귀: 빈 폼은 이 칸만 0 으로 열린다. 실측 등록물은 3,000 이다. */
  it('반품/교환 배송비를 반드시 덮어쓴다 — 빈 폼은 0 으로 열린다', () => {
    expect(esmplusFormFromDraft(draft()).sectionFields['반품/교환 배송비(편도)']).toBe(
      String(ESMPLUS_RETURN_FEE),
    );
    expect(ESMPLUS_RETURN_FEE).toBe(3000);
  });

  it('고시 값도 같은 그릇에 담는다 — 고시 줄이 일반 칸과 같은 블록이다', () => {
    const form = esmplusFormFromDraft(draft());
    expect(form.sectionFields['크기/중량']).toBe('90x90cm');
    expect(form.sectionFields['품질보증기준']).toContain('공정거래위원회');
  });

  it('고시를 열려면 상품군을 먼저 골라야 한다 — 그 열쇠를 함께 넘긴다', () => {
    const form = esmplusFormFromDraft(draft());
    expect(form.sectionDropdowns.상품군).toBe(ESMPLUS_NOTICE_GROUP);
    expect(form.noticeGroup).toBe('어린이제품');
  });

  it('배송은 담지 않는다 — 빈 폼이 이미 계정 템플릿으로 차 있다', () => {
    const form = esmplusFormFromDraft(draft());
    for (const key of ['택배사', '발송정책', '출고지', '배송비 선택', '반품 교환지']) {
      expect(form.sectionFields[key]).toBeUndefined();
      expect(form.sectionDropdowns[key]).toBeUndefined();
    }
  });

  it('대표 + 추가를 한 줄로 모은다 — 칸 하나에 multiple 로 넣는다', () => {
    const form = esmplusFormFromDraft(draft());
    expect(form.images).toEqual([
      'https://cdn.example.com/rep.jpg',
      'https://cdn.example.com/a1.jpg',
      'https://cdn.example.com/a2.jpg',
    ]);
  });

  it('이미지는 열다섯 장까지다 — 화면 안내가 0/15 였다', () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    const form = esmplusFormFromDraft(draft({ additionalImageUrls: many }));
    expect(form.images).toHaveLength(ESMPLUS_MAX_IMAGES);
  });

  it('빈 이미지 주소는 버린다 — 빈칸이 대표 자리를 먹으면 순서가 밀린다', () => {
    const form = esmplusFormFromDraft(
      draft({ representativeImageUrl: '  ', additionalImageUrls: ['', 'https://c/a.jpg'] }),
    );
    expect(form.images).toEqual(['https://c/a.jpg']);
  });

  it('카테고리는 경로를 줄 때만 담고 검색어를 스스로 만든다', () => {
    expect(esmplusFormFromDraft(draft()).category).toBeNull();
    const form = esmplusFormFromDraft(draft(), {
      categoryPath: '이벤트/파티용품>기타이벤트/파티용품',
    });
    expect(form.category).toEqual({
      query: '기타이벤트',
      path: '이벤트/파티용품>기타이벤트/파티용품',
    });
  });

  it('검색어를 직접 주면 그걸 쓴다', () => {
    const form = esmplusFormFromDraft(draft(), {
      categoryPath: '이벤트/파티용품>기타이벤트/파티용품',
      categoryQuery: '파티용품',
    });
    expect(form.category?.query).toBe('파티용품');
  });

  it('안전인증번호는 초안 고시에서도 읽는다 — 어댑터가 따로 안 넘겨도 된다', () => {
    const withCert = draft();
    withCert.notice.fields.안전인증번호 = 'CB999';
    const form = esmplusFormFromDraft(withCert);
    expect(form.sectionRadios['어린이제품 인증']).toBe('인증대상');
    expect(form.sectionFields['인증 유형']).toBe('CB999');
  });

  it('판매자 관리코드와 브랜드는 있을 때만 담는다', () => {
    const bare = esmplusFormFromDraft(draft({ brand: '  ' }));
    expect(bare.sectionFields['판매자 관리코드']).toBeUndefined();
    expect(bare.sectionFields['브랜드 및 제조사']).toBeUndefined();
    const full = esmplusFormFromDraft(draft(), { sellerCode: 'KIDITEM-1' });
    expect(full.sectionFields['판매자 관리코드']).toBe('KIDITEM-1');
    expect(full.sectionFields['브랜드 및 제조사']).toBe('노브랜드');
  });

  it('상세 이미지는 확장이 올릴 수 있게 주소 목록으로 넘긴다', () => {
    expect(esmplusFormFromDraft(draft()).detailUploads).toEqual([
      { url: 'https://kiditem.diskn.com/2mzzbLYEQe' },
    ]);
  });

  it('⭐ 사람이 눌러야 한다는 것을 안내에 남긴다 — 확장은 등록 버튼을 누르지 않는다', () => {
    const steps = esmplusFormFromDraft(draft()).manualSteps.join(' ');
    expect(steps).toContain('사람이 직접 등록');
    expect(steps).toContain('G마켓·옥션');
  });
});
