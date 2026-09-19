import {
  hasDetail,
  isDomesticOrigin,
  isSingleOption,
  mallByteLength,
  noticeKind,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * G마켓 · 옥션(ESM 2.0) 상품 일괄등록 — `NEW 일반상품` 시트(문서버전 NEW 2.0, 판매자센터 2026-09-20 받음).
 *
 * 한 줄이 상품 하나이고 G마켓 · 옥션을 한 번에 올린다. 사이트마다 카테고리 번호 · 판매가 · 재고 칸이 따로다.
 * 옵션은 `옵션 입력값` 한 칸에 줄마다 `값,상태,노출,G재고,A재고` 로 적고 추가금액 칸이 없다 — 옵션마다 값이 다른
 * 상품은 이 파일로 올리지 않는다. 상세설명은 HTML, 사진은 인터넷 주소만 받는다.
 *
 * 고정값 기본은 키드아이템 ESM 계정에서 읽은 값이다(2026-09-20): 판매중 상품이 쓰는 출하지 · 배송정책(3,000원,
 * 3만원 이상 무료) · 반품/교환 주소 · CJ택배 · 당일발송(13시) 정책. 고시는 계정에 템플릿이 `기타 재화` 하나뿐이라
 * 그것을 쓴다.
 */

/** ESM 원산지 지역코드(우리 상품이 쓰는 것만. 판매중 상품에서 읽음). */
const ESM_ORIGIN_CODE: Readonly<Record<string, string>> = {
  중국: '174',
};

function sites(value: string): { gmarket: boolean; auction: boolean; label: string } {
  const text = value.replace(/\s+/g, '');
  const gmarket = /G마켓|지마켓/i.test(text);
  const auction = /옥션/.test(text);
  if (gmarket && auction) return { gmarket, auction, label: '옥션/G마켓' };
  if (auction) return { gmarket: false, auction: true, label: '옥션' };
  return { gmarket: true, auction: false, label: 'G마켓' };
}

const OPTION_TYPE = ['미사용', '단독형', '2개조합형', '3개조합형'] as const;

export const esmSheet: MallBulkSheetSpec = {
  sheetKey: 'esm',
  label: 'G마켓 · 옥션',
  mallKeys: ['gmarket', 'auction'],
  categoryBy: 'code',
  template: {
    file: 'esm-new_basic_bulk.xlsx',
    sheet: 'NEW 일반상품',
    headerRow: 4,
    firstDataRow: 8,
    bookType: 'xlsx',
    keepColumnLetters: ['A'],
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'sites', label: '노출 사이트', required: true, defaultValue: '옥션/G마켓', help: '옥션/G마켓 · G마켓 · 옥션 중 하나' },
    { key: 'gmarketId', label: 'G마켓 판매자 ID', required: true, defaultValue: 'kiditem' },
    { key: 'auctionId', label: '옥션 판매자 ID', required: true, defaultValue: 'kiditem' },
    { key: 'saleDays', label: '판매기간', required: true, defaultValue: '무제한', help: '15 · 30 · 60 · 90 · 무제한' },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'shipMethod', label: '배송방법', required: true, defaultValue: '일반택배' },
    { key: 'shipPlace', label: '출하지 코드', required: true, defaultValue: '580749', help: '판매자 묶음배송비(1)' },
    { key: 'shipPolicy', label: '배송정책번호', required: true, defaultValue: '33173429', help: '3,000원 · 3만원 이상 무료(조건부)' },
    { key: 'returnAddress', label: '반품/교환 주소 코드', required: true, defaultValue: '966781' },
    { key: 'dispatchGmarket', label: 'G마켓 발송정책', required: true, defaultValue: '-13', help: '당일발송(13시 마감)' },
    { key: 'dispatchAuction', label: '옥션 발송정책', required: true, defaultValue: '-13', help: '당일발송(13시 마감)' },
    { key: 'courier', label: '택배사 코드', required: true, defaultValue: '10013', help: 'CJ택배' },
    { key: 'returnFee', label: '반품/교환 배송비', required: true, defaultValue: '3000' },
    { key: 'noticeGroup', label: '상품군 코드', required: true, defaultValue: '35', help: '35 기타 재화 · 23 어린이제품' },
    { key: 'noticeTemplate', label: '상품고시정보 템플릿코드', required: true, defaultValue: '81359', help: '계정의 "기타" 템플릿' },
  ],
  notes: [
    'ESM 판매자센터 › 상품 관리 › 상품 일괄등록 › [엑셀 업로드]에 올립니다. 한 파일에 500개까지입니다.',
    '고시는 계정 템플릿(기타 재화)으로 들어갑니다. 어린이제품 고시로 올리려면 ESM에서 어린이제품 템플릿을 만들고 번호를 바꿔 넣으세요.',
    '옵션명은 ESM이 카테고리마다 정해 둔 이름만 받습니다. 실패 사유에 옵션명이 나오면 판매상품의 옵션 단 이름을 바꿔 다시 받으세요.',
  ],
  rows(product: MallSheetProduct, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const site = sites(fixed.sites ?? '');
    const gmarket = product.malls.gmarket;
    const auction = product.malls.auction;
    const primary = (site.gmarket ? gmarket : auction) ?? gmarket ?? auction;
    if (!primary) return { rows: [], problems: ['G마켓 · 옥션 값이 없습니다.'], warnings };

    const gmarketCode = site.gmarket ? gmarket?.categoryCode ?? null : null;
    const auctionCode = site.auction ? auction?.categoryCode ?? null : null;
    if (site.gmarket && !gmarketCode) {
      problems.push(`G마켓 카테고리 번호를 모릅니다${gmarket?.categoryPath ? ` (${gmarket.categoryPath})` : ''}.`);
    }
    if (site.auction && !auctionCode) {
      problems.push(`옥션 카테고리 번호를 모릅니다${auction?.categoryPath ? ` (${auction.categoryPath})` : ''}.`);
    }
    const esmCode = gmarket?.values.esmCategoryCode?.trim()
      || auction?.values.esmCategoryCode?.trim()
      || context.categories.esmCode(gmarketCode)
      || context.categories.esmCode(auctionCode);
    if ((gmarketCode || auctionCode) && !esmCode) {
      problems.push('ESM 카테고리 번호를 모릅니다 — 판매상품 몰별 값에 `esmCategoryCode` 를 넣어 주세요.');
    }

    const name = primary.name.trim();
    if (mallByteLength(name) > 100) problems.push(`상품명이 100byte(한글 50자)를 넘습니다: ${mallByteLength(name)}byte.`);
    if (site.gmarket && (gmarket?.salePrice ?? 0) <= 0) problems.push('G마켓 판매가가 0원입니다.');
    if (site.auction && (auction?.salePrice ?? 0) <= 0) problems.push('옥션 판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다(ESM은 사진 주소만 받습니다).');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(primary.detailHtml)) problems.push('상세설명이 비어 있습니다.');

    const stock = Number(fixed.stock) || 999;
    const option = esmOptionCells(product, stock);
    problems.push(...option.problems);

    const origin = originCountryName(product.originCountry);
    const originCode = origin ? ESM_ORIGIN_CODE[origin] ?? null : null;
    const originCells: MallSheetRow = isDomesticOrigin(product.originCountry)
      ? { '원산지 상품타입': '해당없음', '원산지 지역타입': '국내산', '원산지 지역코드': null, '복수 원산지여부': '단일원산지' }
      : originCode
        ? { '원산지 상품타입': '해당없음', '원산지 지역타입': '해외수입', '원산지 지역코드': originCode, '복수 원산지여부': '단일원산지' }
        : { '원산지 상품타입': '상세설명표기', '원산지 지역타입': null, '원산지 지역코드': null, '복수 원산지여부': null };
    if (!isDomesticOrigin(product.originCountry) && !originCode) {
      warnings.push(`원산지(${origin ?? '비어 있음'})를 ESM 코드로 바꾸지 못해 '상세설명표기'로 넣습니다.`);
    }

    if (problems.length) return { rows: [], problems, warnings };
    const row: MallSheetRow = {
      '노출 사이트': site.label,
      'A ID': site.auction ? fixed.auctionId : null,
      'G ID': site.gmarket ? fixed.gmarketId : null,
      상품명: name,
      'A프로모션 문구': site.auction ? auction?.promoText ?? null : null,
      'G프로모션 문구': site.gmarket ? gmarket?.promoText ?? null : null,
      '카테고리 코드': esmCode,
      'A 노출코드': auctionCode,
      'G 노출코드': gmarketCode,
      판매기간: fixed.saleDays,
      'A 판매가': site.auction ? auction!.salePrice : null,
      'G 판매가': site.gmarket ? gmarket!.salePrice : null,
      'A 재고': site.auction ? stock : null,
      'G 재고': site.gmarket ? stock : null,
      ...option.cells,
      기본이미지: product.imageUrls[0]!,
      추가이미지: product.imageUrls.slice(1, 15).join(',') || null,
      상품상세설명: primary.detailHtml,
      배송방법: fixed.shipMethod,
      '출하지 코드': fixed.shipPlace,
      배송정책번호: fixed.shipPolicy,
      '반품/교환 주소 코드': fixed.returnAddress,
      'A 발송정책': site.auction ? fixed.dispatchAuction : null,
      'G 발송정책': site.gmarket ? fixed.dispatchGmarket : null,
      '택배사 코드': fixed.courier,
      '반품/교환 배송비': Number(fixed.returnFee) || 0,
      '상품군 코드': fixed.noticeGroup,
      '상품고시정보 템플릿코드': fixed.noticeTemplate,
      // 어린이제품 · 전기용품 · 생활용품 · 생활화학 순서. 어린이제품 인증번호는 상세설명에 싣는다.
      인증타입: noticeKind(product.noticeCategory) === 'child' ? '상세설명표기' : '인증대상아님',
      '인증타입#2': '인증대상아님',
      병행수입여부: '해당사항없음',
      '인증타입#3': '인증대상아님',
      '병행수입여부#2': '해당사항없음',
      '인증타입#4': '인증대상아님',
      ...originCells,
      '청소년구매 불가여부': '구매가능',
      부가세여부: product.taxType === 'tax_free' ? '면세상품' : '과세상품',
    };
    return { rows: [row], problems, warnings };
  },
};

/** ESM 옵션 세 칸(`옵션 타입` · `옵션명` · `옵션 입력값`). */
function esmOptionCells(
  product: MallSheetProduct,
  stock: number,
): { cells: MallSheetRow; problems: string[] } {
  if (isSingleOption(product)) {
    return { cells: { '옵션 타입': '미사용', 옵션명: null, '옵션 입력값': null }, problems: [] };
  }
  const problems: string[] = [];
  const axes = product.optionAxes;
  if (axes.length > 3) problems.push('ESM은 옵션 단을 셋까지 받습니다.');
  if (product.options.some((option) => option.extraPrice !== 0)) {
    problems.push('ESM 엑셀은 옵션 추가금액 칸이 없습니다. 옵션마다 값이 다른 상품은 ESM 화면에서 등록하세요.');
  }
  const values = product.options.flatMap((option) => option.values);
  if ([...axes, ...values].some((value) => /[,\n]/.test(value))) {
    problems.push('옵션 이름이나 값에 쉼표가 있습니다(ESM 옵션 칸 구분자).');
  }
  const lines = product.options.map((option) =>
    [...option.values.slice(0, axes.length), '정상', '노출', stock, stock].join(','));
  return {
    cells: {
      '옵션 타입': OPTION_TYPE[Math.min(axes.length, 3)]!,
      옵션명: axes.join(','),
      '옵션 입력값': lines.join('\n'),
    },
    problems,
  };
}
