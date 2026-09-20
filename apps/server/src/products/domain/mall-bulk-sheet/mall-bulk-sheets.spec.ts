import { describe, expect, it } from 'vitest';
import { coupangWingSheet } from './coupang-wing.sheet';
import { elevenstSheet } from './elevenst.sheet';
import { esmSheet } from './esm.sheet';
import { kidsnoteSheet } from './kidsnote.sheet';
import {
  detailImageUrls,
  headerIndex,
  isPublicImageUrl,
  missingFixedFields,
  resolveFixedValues,
  type MallBulkSheetSpec,
  type MallSheetContext,
} from './mall-bulk-sheet';
import { MallCategoryLookup, parseCoupangPurchaseOption, type MallCategoryTables } from './mall-sheet-categories';
import { MallCategorySuggester, nameBigrams } from './mall-category-suggestions';
import { MALL_BULK_SHEET_UNAVAILABLE, MALL_BULK_SHEETS } from './mall-bulk-sheet-registry';
import {
  mallDisplayName,
  pendingPublicImages,
  toMallSheetProduct,
  unreadableSheetImages,
  type MallSheetSourceProduct,
} from './mall-sheet-product';

const TABLES: MallCategoryTables = {
  paths: {
    gmarket: { '장난감/완구>감각발달완구>기타감각발달완구': '100000042200001589300028350' },
    auction: { '장난감/완구>감각발달완구>기타감각발달완구': '20141000' },
    '11st': { '장난감>감각발달완구>비눗방울/버블건': '1010963' },
  },
  esmBySite: { '100000042200001589300028350': '00310013000100010000', '20141000': '00310013000100010000' },
  coupang: {
    '77388': ['완구/취미>스포츠/야외완구>비누방울', '색상 [필수]', '수량 [필수] [기본단위: 개]'],
    '80000': ['식품>과자>젤리', '(택1) 개당 중량 [필수] [기본단위: g]', '(택1) 개당 용량 [필수] [기본단위: ml]', '수량 [필수] [기본단위: 개]'],
  },
};
const lookup = new MallCategoryLookup(TABLES);

function source(overrides: Partial<MallSheetSourceProduct> = {}): MallSheetSourceProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100105',
    ownCode: null,
    name: '할로윈 호박 바구니 12개',
    brand: 'kiditem',
    manufacturer: '해피프랜즈',
    modelName: null,
    modelNo: null,
    originCountry: 'CHINA',
    keywords: ['할로윈', '사탕바구니'],
    taxType: 'taxable',
    salePrice: 3960,
    tagPrice: null,
    imageUrls: ['http://localhost:9000/kiditem/sales-products/a/images/1.jpg'],
    detailHtml: '<center><img src="https://kiditem.diskn.com/T83fBBvdxE"></center>',
    noticeCategory: '023',
    certificationNumbers: [],
    optionAxes: [],
    options: [{ code: '100105-0001', values: [], extraPrice: 0, barcode: null, supplyStatus: 'selling' }],
    overrides: [
      {
        mallKey: 'gmarket',
        salePrice: 4200,
        priceRateBp: null,
        name: null,
        detailHtml: null,
        promoText: null,
        adapterValues: { sabangnetCategoryPath: '장난감/완구 > 감각발달완구 > 기타감각발달완구' },
      },
      {
        mallKey: 'auction',
        salePrice: null,
        priceRateBp: 11000,
        name: null,
        detailHtml: null,
        promoText: null,
        adapterValues: { sabangnetCategoryPath: '장난감/완구 > 감각발달완구 > 기타감각발달완구' },
      },
      {
        mallKey: '11st',
        salePrice: null,
        priceRateBp: null,
        name: null,
        detailHtml: null,
        promoText: null,
        adapterValues: { sabangnetCategoryPath: '장난감 > 감각발달완구 > 비눗방울/버블건' },
      },
      {
        mallKey: 'coupang',
        salePrice: null,
        priceRateBp: null,
        name: null,
        detailHtml: null,
        promoText: null,
        adapterValues: { categoryCode: '77388' },
      },
      {
        mallKey: 'kidsnote',
        salePrice: null,
        priceRateBp: null,
        name: null,
        detailHtml: null,
        promoText: null,
        adapterValues: { sabangnetCategoryPath: '선물/행사/체험 > 행사용품 > 할로윈데이' },
      },
    ],
    sabangnetImageUrls: ['https://pic.sabangnet.co.kr/product_image/1.jpg', 'https://pic.sabangnet.co.kr/product_image/2.jpg'],
    ...overrides,
  };
}

function withOptions(extraPrices: number[]): Partial<MallSheetSourceProduct> {
  return {
    optionAxes: ['색상'],
    options: extraPrices.map((extraPrice, index) => ({
      code: `100105-000${index + 1}`,
      values: [['빨강', '파랑', '노랑'][index]!],
      extraPrice,
      barcode: null,
      supplyStatus: 'selling',
    })),
  };
}

function run(spec: MallBulkSheetSpec, input: MallSheetSourceProduct, fixed: Record<string, string> = {}) {
  const context: MallSheetContext = { fixed: resolveFixedValues(spec, fixed), categories: lookup };
  return spec.rows(toMallSheetProduct(input, spec, lookup), context);
}

describe('toMallSheetProduct', () => {
  it('prices each mall from its own value and falls back to Sabangnet images when ours are private', () => {
    const product = toMallSheetProduct(source(), esmSheet, lookup);
    expect(product.malls.gmarket!.salePrice).toBe(4200);
    expect(product.malls.auction!.salePrice).toBe(4356);
    expect(product.malls.gmarket!.categoryCode).toBe('100000042200001589300028350');
    expect(product.imageSource).toBe('sabangnet');
    expect(product.imageUrls).toEqual(['https://pic.sabangnet.co.kr/product_image/1.jpg', 'https://pic.sabangnet.co.kr/product_image/2.jpg']);
  });

  it('uses public copies of our photos and of detail images once every photo has one', () => {
    const own = 'http://localhost:9000/kiditem/sales-products/a/images/1.jpg';
    const detail = 'http://localhost:9000/kiditem/candidates/a/detail.jpg';
    const input = source({ detailHtml: `<img src="${detail}"><img src="https://kiditem.diskn.com/x">` });
    const copies = new Map([[own, 'https://kids-wi.kakaocdn.net/1.jpg']]);
    expect(pendingPublicImages(input, copies)).toEqual([detail]);

    const partial = toMallSheetProduct(input, kidsnoteSheet, lookup, copies);
    expect(partial.imageSource).toBe('own');
    expect(partial.imageUrls).toEqual(['https://kids-wi.kakaocdn.net/1.jpg']);
    expect(unreadableSheetImages(input, partial)).toEqual([detail]);

    copies.set(detail, 'https://kids-wi.kakaocdn.net/detail.jpg');
    const full = toMallSheetProduct(input, kidsnoteSheet, lookup, copies);
    expect(full.malls.kidsnote!.detailHtml).toContain('<img referrerpolicy="no-referrer" src="https://kids-wi.kakaocdn.net/detail.jpg">');
    expect(full.malls.kidsnote!.detailHtml).toContain('<img src="https://kiditem.diskn.com/x">');
    expect(full.malls.kidsnote!.detailHtml).not.toContain('localhost');
    expect(unreadableSheetImages(input, full)).toEqual([]);
    expect(pendingPublicImages(input, copies)).toEqual([]);
  });

  it('blocks our private photos only when there is no Sabangnet photo to fall back to', () => {
    const fallback = toMallSheetProduct(source(), esmSheet, lookup);
    expect(unreadableSheetImages(source(), fallback)).toEqual([]);
    const fresh = source({ sabangnetImageUrls: [] });
    expect(unreadableSheetImages(fresh, toMallSheetProduct(fresh, esmSheet, lookup)))
      .toEqual(['http://localhost:9000/kiditem/sales-products/a/images/1.jpg']);
  });

  it('keeps our own images when they are public and drops options that are not selling', () => {
    const product = toMallSheetProduct(source({
      imageUrls: ['https://cdn.example.com/a.jpg'],
      ...withOptions([0, 0]),
      options: [
        { code: 'a', values: ['빨강'], extraPrice: 0, barcode: null, supplyStatus: 'selling' },
        { code: 'b', values: ['파랑'], extraPrice: 0, barcode: null, supplyStatus: 'unused' },
      ],
    }), esmSheet, lookup);
    expect(product.imageSource).toBe('own');
    expect(product.options.map((option) => option.code)).toEqual(['a']);
  });
});

describe('ESM sheet', () => {
  it('writes both sites with ESM · site category codes, per-site prices and the account defaults', () => {
    const result = run(esmSheet, source());
    expect(result.problems).toEqual([]);
    expect(result.warnings).toContain('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    const [row] = result.rows;
    expect(row).toMatchObject({
      '노출 사이트': '옥션/G마켓',
      'G ID': 'kiditem',
      'A ID': 'kiditem',
      '카테고리 코드': '00310013000100010000',
      'G 노출코드': '100000042200001589300028350',
      'A 노출코드': '20141000',
      'G 판매가': 4200,
      'A 판매가': 4356,
      '옵션 타입': '미사용',
      배송정책번호: '33173429',
      '택배사 코드': '10013',
      인증타입: '상세설명표기',
      '원산지 지역코드': '174',
      부가세여부: '과세상품',
    });
  });

  it('refuses options with extra prices because the ESM sheet has no option price cell', () => {
    const result = run(esmSheet, source(withOptions([0, 500])));
    expect(result.rows).toEqual([]);
    expect(result.problems.join(' ')).toContain('옵션 추가금액');
  });

  it('writes one option line per unit as value,status,display,G stock,A stock', () => {
    const [row] = run(esmSheet, source(withOptions([0, 0])), { stock: '50' }).rows;
    expect(row).toMatchObject({ '옵션 타입': '단독형', 옵션명: '색상', '옵션 입력값': '빨강,정상,노출,50,50\n파랑,정상,노출,50,50' });
  });

  it('blocks a site whose category code is unknown', () => {
    const result = run(esmSheet, source({ overrides: source().overrides.filter((item) => item.mallKey !== 'auction') }));
    expect(result.problems.join(' ')).toContain('옥션 카테고리 번호를 모릅니다');
    expect(run(esmSheet, source({ overrides: source().overrides.filter((item) => item.mallKey !== 'auction') }), { sites: 'G마켓' }).problems)
      .toEqual([]);
  });
});

describe('11st sheet', () => {
  it('writes codes for the fixed-price sale, overseas origin and the child-product notice', () => {
    const result = run(elevenstSheet, source());
    expect(result.problems).toEqual([]);
    const [row] = result.rows;
    expect(row).toMatchObject({
      카테고리코드: '1010963',
      판매가: 3960,
      판매방식: '01',
      원산지: '02',
      '원산지 상세지역': '1287',
      고시유형코드: '891033',
      고시항목코드1: '11800',
      고시상세항목내용1: '할로윈 호박 바구니 12개',
      닉네임: '키드아이템',
      '발송예정일 설정': '1086143',
      '배송비 설정': '07',
      묶음배송: 'Y',
    });
    expect(row!.인증정보).toBe('01|03\n02|01\n134|\n03|03\n04|05');
  });

  it('puts option prices on the first axis and keeps one zero-price option', () => {
    const [row] = run(elevenstSheet, source(withOptions([0, 500, 0])), { stock: '10' }).rows;
    expect(row).toMatchObject({ 판매옵션: '01', 판매옵션값: '빨강|파랑|노랑', 판매옵션가격: '0|500|0', 옵션재고수량: '10|10|10', 재고수량: 30 });
    expect(run(elevenstSheet, source(withOptions([300, 500]))).problems.join(' ')).toContain('0원인 옵션');
  });
});

describe('Coupang Wing sheet', () => {
  it('writes one row per unit with the category purchase options', () => {
    const result = run(coupangWingSheet, source(withOptions([0, 500])));
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({
      카테고리: '[77388] 완구/취미>스포츠/야외완구>비누방울',
      '브랜드 ID': '브랜드 없음',
      제조사: '해피프랜즈',
      옵션유형1: '색상',
      옵션값1: '파랑',
      옵션유형2: '수량',
      옵션값2: '1개',
      판매가격: 4460,
      업체상품코드: '100105-0002',
      '상품고시정보 카테고리': '기타 재화',
      '상세 설명': 'https://kiditem.diskn.com/T83fBBvdxE',
    });
  });

  it('refuses a category whose required purchase option needs a weight or volume', () => {
    const result = run(coupangWingSheet, source({
      overrides: source().overrides.map((item) => (item.mallKey === 'coupang' ? { ...item, adapterValues: { categoryCode: '80000' } } : item)),
    }));
    expect(result.problems.join(' ')).toContain('(택1)');
  });
});

describe('Kidsnote sheet', () => {
  it('writes category names, the kidsnote prefix, seller values and the etc notice joined by ^', () => {
    const [row] = run(kidsnoteSheet, source()).rows;
    expect(row).toMatchObject({
      상품코드: '100105',
      상품명: '[키드아이템] 할로윈 호박 바구니 12개',
      대분류: '선물/행사/체험',
      중분류: '행사용품',
      소분류: '할로윈데이',
      판매가: 3960,
      판매자: '거영I&D',
      입점수수료: 15,
      상품정보고시: '기타',
    });
    expect(String(row!['상품정보제공고시 항목(^기호로 구분)']).split('^')).toHaveLength(26);
  });

  it('writes a one-axis option set with unit codes and extra prices', () => {
    const [row] = run(kidsnoteSheet, source(withOptions([0, 500]))).rows;
    expect(row!.상품옵션1).toBe('색상::콤보박스::빨강$$100105-0001$$0::파랑$$100105-0002$$500');
  });
});

describe('sheet helpers', () => {
  it('addresses repeated headers by occurrence', () => {
    const index = headerIndex(['노출\n사이트', '인증타입', '인증타입', null, '인증타입']);
    expect(index.get('노출 사이트')).toBe(0);
    expect(index.get('인증타입')).toBe(1);
    expect(index.get('인증타입#2')).toBe(2);
    expect(index.get('인증타입#3')).toBe(4);
  });

  it('treats our storage and private hosts as not reachable by malls', () => {
    expect(isPublicImageUrl('http://localhost:9000/kiditem/a.jpg')).toBe(false);
    expect(isPublicImageUrl('http://192.168.0.10/a.jpg')).toBe(false);
    expect(isPublicImageUrl('http://kiditem-office:9000/kiditem/a.jpg')).toBe(false);
    expect(isPublicImageUrl('https://pic.sabangnet.co.kr/a.jpg')).toBe(true);
    expect(isPublicImageUrl('//img.example.com/a.jpg')).toBe(true);
  });

  it('reads detail image urls in order once', () => {
    expect(detailImageUrls('<img src="https://a/1.jpg"><IMG alt="" src=\'https://a/2.jpg\'><img src="https://a/1.jpg">'))
      .toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
  });

  it('reports empty required fixed values by label', () => {
    expect(missingFixedFields(esmSheet, { ...resolveFixedValues(esmSheet, {}), shipPlace: ' ' })).toEqual(['출하지 코드']);
  });

  it('parses Coupang purchase option cells', () => {
    expect(parseCoupangPurchaseOption('수량 [필수] [기본단위: 개]')).toEqual({ name: '수량', required: true, unit: '개', pickOne: false });
    expect(parseCoupangPurchaseOption('(택1) 개당 중량 [필수] [기본단위: g]')).toEqual({ name: '개당 중량', required: true, unit: 'g', pickOne: true });
  });

  it('strips the Sabangnet mall group prefix before looking a path up', () => {
    const table = new MallCategoryLookup({ ...TABLES, paths: { '11st': { '문구/사무용품>문구용품>문구용품 기타': '1010609' } } });
    expect(table.code('11st', '도서/문구::문구/사무용품 > 문구용품 > 문구용품 기타')).toBe('1010609');
  });
});

describe('MallCategorySuggester', () => {
  const paths = [
    ['p1', '11st', '장난감>비눗방울'], ['p1', 'gmarket', 'G>비눗방울놀이'], ['p1', 'smartstore', 'S>버블'],
    ['p2', '11st', '장난감>비눗방울'], ['p2', 'gmarket', 'G>비눗방울놀이'], ['p2', 'smartstore', 'S>버블'],
    ['p3', '11st', '장난감>비눗방울'], ['p3', 'gmarket', 'G>기타완구'], ['p3', 'smartstore', 'S>버블'],
    ['p4', '11st', '장난감>비눗방울'], ['p4', 'smartstore', 'S>버블'],
  ].map(([salesProductId, mallKey, path]) => ({ salesProductId: salesProductId!, mallKey: mallKey!, path: path! }));

  it('suggests the target category most products with the same other-mall categories use', () => {
    const suggestion = new MallCategorySuggester(paths).suggest('p4', 'gmarket');
    expect(suggestion).toEqual({ path: 'G>비눗방울놀이', share: 0.67, voters: 2, basis: 'other_malls' });
  });

  it('has nothing to say for a product without other-mall categories', () => {
    expect(new MallCategorySuggester(paths).suggest('unknown', 'gmarket')).toBeNull();
  });

  it('falls back to what products with similar names use in the target mall', () => {
    const named = [
      { salesProductId: 'n1', mallKey: '11st', path: '장난감>비눗방울', name: '3500 게틀링 비눗방울총(1p)' },
      { salesProductId: 'n2', mallKey: '11st', path: '장난감>비눗방울', name: '돌고래 비눗방울총' },
      { salesProductId: 'n3', mallKey: '11st', path: '문구>지우개', name: '과일 지우개 세트' },
    ];
    const suggestion = new MallCategorySuggester(named).suggest('new', '11st', '대용량 버블 비눗방울총');
    expect(suggestion).toMatchObject({ path: '장난감>비눗방울', voters: 2, basis: 'similar_names' });
    expect(new MallCategorySuggester(named).suggest('new', '11st', '원목 블록')).toBeNull();
  });

  it('cuts names into two-letter pieces without price codes, counts or bare numbers', () => {
    expect([...nameBigrams('3500 비눗방울(10개) 2024')].sort()).toEqual(['눗방', '방울', '비눗']);
  });
});

describe('mallDisplayName', () => {
  it('drops a leading price code of three or more digits but keeps other leading numbers', () => {
    expect(mallDisplayName('3500 게틀링 비눗방울총(1p)')).toBe('게틀링 비눗방울총(1p)');
    expect(mallDisplayName('700받아쓰기노트(10권)')).toBe('받아쓰기노트(10권)');
    expect(mallDisplayName('1+1 5000돌고래비눗방울')).toBe('1+1 5000돌고래비눗방울');
    expect(mallDisplayName('2024')).toBe('2024');
  });
});

describe('mall bulk sheet registry', () => {
  it('never lists a mall both as having a sheet and as having no bulk Excel', () => {
    const covered = new Set(MALL_BULK_SHEETS.flatMap((sheet) => sheet.mallKeys));
    expect(MALL_BULK_SHEET_UNAVAILABLE.filter((item) => covered.has(item.mallKey))).toEqual([]);
    expect([...covered].sort()).toEqual([
      '11st', 'auction', 'coupang', 'gmarket', 'kidsnote', 'kkomangse', 'teacher-mall', 'thirtymall',
    ]);
  });
});
