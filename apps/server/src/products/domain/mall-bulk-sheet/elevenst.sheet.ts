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
 * 11번가 신규상품 대량등록 — `ExcelUnitProductList-Ver2.50.xls`(셀러오피스 › 상품관리 › 신규상품 대량등록, 공개 파일).
 *
 * 1~3행(묶음 · 칸 이름 · 필수 여부)은 남기고 4~5행(안내 · 예시)은 지우라고 적혀 있어 4행부터 쓴다. 대부분의 칸이
 * 코드다 — 판매방식 01, 원산지 02 + 상세지역, 고시는 유형 코드 + 항목 코드 · 내용 짝 14개. 옵션은 옵션명 코드
 * (01 색상 · 02 사이즈 · 23 종류 …)와 `|` 로 이은 값 · 가격 · 재고이고, 가격 · 재고는 첫 번째 옵션 값에만 붙는다.
 * 사진은 인터넷 주소를 받는다.
 *
 * 고정값 기본은 키드아이템 11번가 계정에서 읽은 값이다(2026-09-20): 스토어명 키드아이템, 발송예정일 템플릿
 * 1086143(평일 15시까지 당일 발송), 판매자 조건부 배송비 3,000원.
 */

/** 11번가 원산지 상세지역(해외) 코드. 셀러오피스 `원산지 상세지역 찾기`에서 읽음. */
const ELEVENST_ORIGIN_CODE: Readonly<Record<string, string>> = {
  중국: '1287',
  베트남: '1265',
  일본: '1285',
  인도: '1283',
  인도네시아: '1284',
};

/** 11번가 판매옵션명 코드. 우리 옵션 단 이름을 여기에 맞춘다(모르는 이름은 `23 종류`). */
const ELEVENST_OPTION_CODE: Readonly<Record<string, string>> = {
  색상: '01',
  컬러: '01',
  사이즈: '02',
  크기: '02',
  단계: '07',
  맛: '08',
  향: '09',
  구성품: '10',
  구성: '10',
  길이: '13',
  재질: '15',
  종류: '23',
  용량: '24',
  무게: '27',
  모양: '31',
  두께: '34',
};

/** 고시 유형(891033 어린이제품 · 891045 기타 재화)과 항목 코드 · 값. 셀러오피스 `상품정보고시 유형별 입력항목`에서 읽음. */
function elevenstNotice(product: MallSheetProduct, name: string, asPhone: string): { type: string; items: [string, string][] } {
  const origin = originCountryName(product.originCountry) ?? '상세설명참조';
  const maker = product.manufacturer?.trim() || '상세설명참조';
  if (noticeKind(product.noticeCategory) === 'child') {
    return {
      type: '891033',
      items: [
        ['11800', name],
        ['11835', '상세설명참조'],
        ['11900', '상세설명참조'],
        ['11905', maker],
        ['2361085', '상세설명참조'],
        ['23759095', origin],
        ['469867873', '해당없음'],
        ['23760223', '상세설명참조'],
        ['23760386', '관련 법 및 소비자 분쟁 해결 기준에 따름'],
        ['23760437', asPhone],
        ['23760454', product.certificationNumbers[0] ?? '상세설명참조'],
        ['40747702', '상세설명참조'],
        ['23759938', '상세설명참조'],
      ],
    };
  }
  return {
    type: '891045',
    items: [
      ['11800', name],
      ['11905', maker],
      ['23760413', asPhone],
      ['23759100', origin],
      ['23756033', product.certificationNumbers[0] ?? '해당없음'],
    ],
  };
}

export const elevenstSheet: MallBulkSheetSpec = {
  sheetKey: '11st',
  label: '11번가',
  mallKeys: ['11st'],
  categoryBy: 'code',
  template: {
    file: '11st-ExcelUnitProductList-Ver2.50.xls',
    sheet: '대량등록 양식',
    headerRow: 2,
    firstDataRow: 4,
    bookType: 'xls',
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'nickname', label: '스토어명(닉네임)', required: true, defaultValue: '키드아이템' },
    { key: 'saleDays', label: '판매기간 코드', required: true, defaultValue: '108', help: '101 3일 … 105 30일 · 106 60일 · 107 90일 · 108 120일' },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'courier', label: '발송택배사 코드', required: true, defaultValue: '00034', help: 'CJ대한통운' },
    { key: 'dispatchTemplate', label: '발송예정일 템플릿 번호', required: true, defaultValue: '1086143', help: '평일 오후 3시까지 주문 건 당일 발송' },
    { key: 'shippingFeeType', label: '배송비 설정 코드', required: true, defaultValue: '07', help: '01 무료 · 02 고정 · 03 상품조건부 무료 · 07 판매자 조건부' },
    { key: 'shippingFee', label: '배송비', required: true, defaultValue: '3000' },
    { key: 'returnFee', label: '반품배송비(편도)', required: true, defaultValue: '3000' },
    { key: 'exchangeFee', label: '교환배송비(왕복)', required: true, defaultValue: '6000' },
    { key: 'asPhone', label: 'A/S 책임자와 전화번호', required: true, defaultValue: '031-908-5401' },
    { key: 'asInfo', label: 'A/S 안내', required: true, defaultValue: '상세설명을 참고하세요.' },
    { key: 'returnInfo', label: '반품/교환 안내', required: true, defaultValue: '상세설명을 참고하세요.' },
  ],
  notes: [
    '셀러오피스 › 상품관리 › 신규상품 대량등록에 올립니다. 하루 500개까지입니다.',
    '11번가는 상품명 클린체크를 거칩니다. 등록실패 다운로드로 실패 사유를 확인하세요.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls['11st'];
    if (!mall) return { rows: [], problems: ['11번가 값이 없습니다.'], warnings };

    if (!mall.categoryCode) {
      problems.push(`11번가 카테고리 번호를 모릅니다${mall.categoryPath ? ` (${mall.categoryPath})` : ''} — 몰별 값에 번호를 넣어 주세요.`);
    }
    const name = mall.name.trim();
    if (name.length > 100) problems.push(`상품명이 100자를 넘습니다: ${name.length}자.`);
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    const promo = mall.promoText?.trim() || null;
    if (promo && mallByteLength(promo) > 28) warnings.push('홍보문구가 28byte(한글 14자)를 넘어 넣지 않습니다.');

    const stock = Number(fixed.stock) || 999;
    const option = elevenstOptionCells(product, mall.salePrice, stock);
    problems.push(...option.problems);
    warnings.push(...option.warnings);

    const domestic = isDomesticOrigin(product.originCountry);
    const origin = originCountryName(product.originCountry);
    const originCode = origin ? ELEVENST_ORIGIN_CODE[origin] ?? null : null;
    if (!domestic && !originCode) problems.push(`원산지(${origin ?? '비어 있음'})의 11번가 상세지역 코드를 모릅니다.`);

    if (problems.length) return { rows: [], problems, warnings };
    const notice = elevenstNotice(product, name, fixed.asPhone ?? '');
    const noticeCells: Record<string, string | null> = {};
    for (let index = 0; index < 14; index += 1) {
      const item = notice.items[index];
      noticeCells[`고시항목코드${index + 1}`] = item?.[0] ?? null;
      noticeCells[`고시상세항목내용${index + 1}`] = item?.[1] ?? null;
    }
    const child = noticeKind(product.noticeCategory) === 'child';
    const certNumber = product.certificationNumbers[0] ?? '';
    const row: MallSheetRow = {
      카테고리코드: mall.categoryCode,
      모델명: product.modelName?.trim() || null,
      모델코드: product.modelNo?.trim() || null,
      상품명: name,
      상품홍보문구: promo && mallByteLength(promo) <= 28 ? promo : null,
      '대표 이미지': product.imageUrls[0]!,
      '추가이미지 1': product.imageUrls[1] ?? null,
      '추가이미지 2': product.imageUrls[2] ?? null,
      '추가이미지 3': product.imageUrls[3] ?? null,
      상세설명: mall.detailHtml,
      '상품리뷰/구매후기': 'Y',
      서비스상품: '01',
      판매방식: '01',
      상품상태: '01',
      판매기간: fixed.saleDays,
      판매가: mall.salePrice,
      ...option.cells,
      재고수량: option.totalStock,
      '권장소비자가(정가)': product.tagPrice && product.tagPrice > mall.salePrice ? product.tagPrice : null,
      닉네임: fixed.nickname,
      '미성년자 구매가능': 'Y',
      '부가세/면세상품': product.taxType === 'tax_free' ? '02' : '01',
      '판매자 상품코드': product.code,
      원산지: domestic ? '01' : '02',
      '원산지 상세지역': domestic ? null : originCode,
      // 인증구분 01~04(전기·생활 / 어린이 / 방송통신 / 생활화학)를 모두 적는다. 어린이제품은 상세설명 참조(134).
      인증정보: child
        ? ['01|03', '02|01', `134|${certNumber}`, '03|03', '04|05'].join('\n')
        : ['01|03', '02|03', '03|03', '04|05'].join('\n'),
      해외구매대행상품: '01',
      고시유형코드: notice.type,
      ...noticeCells,
      배송가능지역: '01',
      배송방법: '01',
      발송택배사: fixed.courier,
      '발송예정일 설정': fixed.dispatchTemplate,
      '배송비 설정': fixed.shippingFeeType,
      배송비: Number(fixed.shippingFee) || 0,
      묶음배송: fixed.shippingFeeType === '03' || fixed.shippingFeeType === '05' ? 'N' : 'Y',
      결제방법: '03',
      반품배송비: Number(fixed.returnFee) || 0,
      '초기무료배송시 반품배송비': '01',
      교환배송비: Number(fixed.exchangeFee) || 0,
      'A/S 안내정보': fixed.asInfo,
      '반품/교환 안내': fixed.returnInfo,
    };
    return { rows: [row], problems, warnings };
  },
};

/** 판매옵션 네 칸 + 합한 재고. 가격 · 재고는 첫 옵션 단 값에만 붙는다(11번가 규칙). */
function elevenstOptionCells(
  product: MallSheetProduct,
  salePrice: number,
  stock: number,
): { cells: MallSheetRow; totalStock: number; problems: string[]; warnings: string[] } {
  const empty = { 판매옵션: null, 판매옵션값: null, 판매옵션가격: null, 옵션재고수량: null };
  if (isSingleOption(product)) return { cells: empty, totalStock: stock, problems: [], warnings: [] };
  const problems: string[] = [];
  const warnings: string[] = [];
  const axes = product.optionAxes;
  if (axes.length > 3) problems.push('11번가 엑셀은 옵션 단을 셋까지 받습니다.');
  const codes = axes.map((axis) => ELEVENST_OPTION_CODE[axis.trim()] ?? '23');
  const unknown = axes.filter((axis) => !ELEVENST_OPTION_CODE[axis.trim()]);
  if (unknown.length) warnings.push(`옵션 단 '${unknown.join(', ')}' 을 11번가 '종류'(23)로 넣습니다.`);
  if (new Set(codes).size !== codes.length) problems.push('두 옵션 단이 같은 11번가 옵션명으로 바뀝니다. 옵션 단 이름을 바꿔 주세요.');

  const valuesByAxis = axes.map((_axis, index) =>
    [...new Set(product.options.map((option) => option.values[index]?.trim() ?? '').filter(Boolean))]);
  if (valuesByAxis.flat().some((value) => value.includes('|'))) problems.push('옵션 값에 11번가 구분 글자(|)가 있습니다.');

  // 추가금액은 첫 단 값마다 하나여야 한다.
  const priceByFirst = new Map<string, Set<number>>();
  for (const option of product.options) {
    const first = option.values[0]?.trim() ?? '';
    const prices = priceByFirst.get(first) ?? new Set<number>();
    prices.add(option.extraPrice);
    priceByFirst.set(first, prices);
  }
  if ([...priceByFirst.values()].some((prices) => prices.size > 1)) {
    problems.push('11번가는 옵션 가격을 첫 번째 옵션 값에만 붙입니다. 뒤 단에 따라 값이 달라지는 상품은 올릴 수 없습니다.');
  }
  const firstPrices = valuesByAxis[0]!.map((value) => [...(priceByFirst.get(value) ?? new Set([0]))][0]!);
  if (!firstPrices.some((price) => price === 0)) problems.push('11번가는 추가금액 0원인 옵션이 하나는 있어야 합니다.');
  if (firstPrices.some((price) => price > salePrice || price < -Math.floor(salePrice / 2))) {
    problems.push('옵션 추가금액이 11번가 범위(판매가 -50% ~ +100%)를 벗어납니다.');
  }
  const firstCount = valuesByAxis[0]!.length;
  const combinations = valuesByAxis.reduce((count, values) => count * Math.max(values.length, 1), 1);
  if (combinations !== product.options.length) {
    warnings.push('옵션이 모든 조합으로 되어 있지 않습니다. 11번가는 조합형으로 모든 짝을 만들어 없는 조합도 팔릴 수 있습니다.');
  }
  return {
    cells: {
      판매옵션: codes.join('\n'),
      판매옵션값: valuesByAxis.map((values) => values.join('|')).join('\n'),
      판매옵션가격: firstPrices.join('|'),
      옵션재고수량: Array.from({ length: firstCount }, () => stock).join('|'),
    },
    totalStock: stock * combinations,
    problems,
    warnings,
  };
}
