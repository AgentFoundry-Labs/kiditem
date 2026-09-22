import {
  categorySegments,
  hasDetail,
  isSingleMallOption,
  mallOptionNormalPrice,
  mallOptionNormalPricesDiffer,
  mallOptionSalePrice,
  mallOptions,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetMallValues,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 키즈노트(위사 입점사) 엑셀일괄 업로드 — `상품 등록 엑셀 샘플 입점사.xls`(입점사 관리자 › 상품일괄등록, 2026-09-20 받음).
 *
 * 첫 줄 제목으로 칸을 찾고(순서 · 빈 칸 삭제 가능) 둘째 줄부터 상품이다. `시스템ID` 가 비면 새로 등록한다.
 * 분류는 번호가 아니라 이름(대 · 중 · 소)이고, 고시는 고시 이름 + 값을 `^` 로 이은 것, 옵션은
 * `세트명::콤보박스::값$$코드$$추가금::…` 이다. 사진 칸이 없다 — 올린 뒤 키즈노트에서 대표사진을 넣어야 한다.
 *
 * 판매자 · 연락처 · 수수료 · 고시(기타) 기본값은 등록 폼 자동채움과 같은 실측값이다.
 */

/** 키즈노트 `기타` 고시 칸 순서(등록 화면 순서). 값은 폼 자동채움 기본값과 같다. */
const KIDSNOTE_ETC_NOTICE: readonly { label: string; value: (product: MallSheetProduct, name: string) => string }[] = [
  { label: '품명 및 모델명', value: (_product, name) => name },
  { label: '법에 의한 인증·허가 등', value: (product) => product.certificationNumbers[0] ?? '해당없음' },
  { label: '제조국', value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { label: '제조사', value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { label: 'A/S 책임자와 전화번호', value: () => '031-908-5401' },
  { label: '품질보증기준', value: () => '관련 법 및 소비자 분쟁 해결 기준을 따름' },
  { label: '수입여부', value: () => 'Y' },
  { label: '안전인증여부', value: (product) => (product.certificationNumbers.length ? '인증' : '해당없음') },
  { label: '표시단위', value: () => '해당없음' },
  { label: '총용량', value: () => '해당없음' },
  { label: '단위용량', value: () => '해당없음' },
  { label: '판매개수', value: () => '1EA' },
  { label: '색상', value: () => '상세설명참조' },
  { label: '사이즈', value: () => '상세설명참조' },
  { label: '제품구성', value: () => '상세설명참조' },
  { label: '재질', value: () => '상세설명참조' },
  { label: '배송설치비용', value: () => '해당없음' },
  { label: '안전인증번호', value: (product) => product.certificationNumbers[0] ?? '해당없음' },
  { label: '상품무게', value: () => '상세설명참조' },
  { label: '포장단위', value: () => '상세설명참조' },
  { label: '자가검사번호', value: () => '해당없음' },
  { label: '취소환불조건', value: () => '해당없음' },
  { label: '이용조건', value: () => '해당없음' },
  { label: '소비자상담전화', value: () => '해당없음' },
  { label: '서비스제공사업자', value: () => '해당없음' },
  { label: '제조연월일', value: () => '해당없음' },
];

/** 키즈노트 옵션 구분 글자. 값에 들어 있으면 칸이 깨진다. */
const KIDSNOTE_OPTION_SEPARATORS = /::|\$\$|\^/;

export const kidsnoteSheet: MallBulkSheetSpec = {
  sheetKey: 'kidsnote',
  label: '키즈노트',
  mallKeys: ['kidsnote'],
  categoryBy: 'name',
  template: {
    file: 'kidsnote-product-upload-sample.xls',
    sheet: '상품데이터',
    headerRow: 1,
    firstDataRow: 2,
    bookType: 'xls',
  },
  maxProducts: 300,
  fixedFields: [
    { key: 'namePrefix', label: '상품명 앞 글자', required: false, defaultValue: '[키드아이템]', help: '몰별 상품명이 없을 때만 붙입니다' },
    { key: 'seller', label: '판매자', required: true, defaultValue: '거영I&D' },
    { key: 'sellerPhone', label: '판매자 연락처', required: true, defaultValue: '031-908-5401' },
    { key: 'partnerRate', label: '입점수수료(%)', required: true, defaultValue: '15' },
    { key: 'deliveryFeeType', label: '배송비 종류', required: true, defaultValue: '기본배송비', help: '기본배송비 · 개별배송비 · 무료배송' },
    { key: 'maxOrder', label: '최대주문한도', required: false, defaultValue: '999' },
  ],
  notes: [
    '키즈노트 관리자 › 상품관리 › 상품일괄등록 › 엑셀일괄 업로드에 올립니다(Excel 97-2003 .xls).',
    '엑셀에는 사진 칸이 없습니다. 올린 뒤 상품마다 대표사진을 넣어야 판매 화면에 사진이 나옵니다.',
    '키즈노트는 본사 승인 뒤에 판매됩니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.kidsnote;
    if (!mall) return { rows: [], problems: ['키즈노트 값이 없습니다.'], warnings };

    const segments = categorySegments(mall.categoryPath);
    if (segments.length === 0) problems.push('키즈노트 분류가 없습니다 — 판매상품 몰별 값에서 분류를 골라 주세요.');
    if (segments.length > 3) warnings.push(`분류가 ${segments.length}단입니다. 엑셀은 소분류까지만 받아 '${segments.slice(0, 3).join(' > ')}' 로 넣습니다.`);
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');

    const name = mall.name.trim();
    const prefix = fixed.namePrefix?.trim();
    const displayName = prefix && !mall.nameIsMallSpecific && !name.startsWith(prefix) ? `${prefix} ${name}` : name;

    const options = kidsnoteOptionCells(product, mall);
    problems.push(...options.problems);
    warnings.push(...options.warnings);
    warnings.push('사진은 엑셀로 들어가지 않습니다. 올린 뒤 키즈노트에서 대표사진을 넣으세요.');

    if (problems.length) return { rows: [], problems, warnings };
    const notice = KIDSNOTE_ETC_NOTICE.map((field) => field.value(product, displayName).replace(/\^/g, ' ')).join('^');
    const row: MallSheetRow = {
      상품코드: product.code,
      상품명: displayName,
      대분류: segments[0] ?? null,
      중분류: segments[1] ?? null,
      소분류: segments[2] ?? null,
      '비회원 노출 설정': 'Y',
      면세상품: product.taxType === 'tax_free' ? 'Y' : 'N',
      키워드: product.keywords.join(',') || null,
      소비자가: Math.max(commonMallNormalPrice(product, mall) ?? product.tagPrice ?? 0, mall.salePrice),
      판매가: mall.salePrice,
      최소주문한도: 1,
      최대주문한도: Number(fixed.maxOrder) || null,
      '배송비 종류': fixed.deliveryFeeType,
      입점수수료: Number(fixed.partnerRate) || null,
      '판매자 연락처': fixed.sellerPhone,
      판매자: fixed.seller,
      // 완구도 `기타` 로 올려 왔다(등록 폼 실측 10건 중 9건). 칸 순서는 KIDSNOTE_ETC_NOTICE.
      상품정보고시: '기타',
      '상품정보제공고시 항목(^기호로 구분)': notice,
      ...options.cells,
      재고관리: '사용안함',
      상세설명: mall.detailHtml,
      '공통정보1(기본)': '기본',
      '공통정보2(기본)': '기본',
      '공통정보3(기본)': '기본',
    };
    return { rows: [row], problems, warnings };
  },
};

/**
 * 옵션 단마다 `상품옵션N` 한 칸. 키즈노트 옵션은 단끼리 조합하지 않고 따로 고르게 하므로, 단이 둘 이상인데 추가금액이
 * 조합마다 다르면 옮길 수 없다.
 */
function kidsnoteOptionCells(product: MallSheetProduct, mall: MallSheetMallValues): {
  cells: MallSheetRow;
  problems: string[];
  warnings: string[];
} {
  const cells: Record<string, string | null> = {
    상품옵션1: null, 상품옵션2: null, 상품옵션3: null, 상품옵션4: null, 상품옵션5: null,
  };
  const options = mallOptions(product, mall);
  if (isSingleMallOption(product, mall)) return { cells, problems: [], warnings: [] };
  if (options.length === 0) return { cells, problems: ['키즈노트 등록 대상에 선택된 판매 옵션이 없습니다.'], warnings: [] };
  const problems: string[] = [];
  const warnings: string[] = [];
  const axes = product.optionAxes;
  if (axes.length > 5) problems.push('키즈노트는 옵션을 다섯 단까지 받습니다.');
  const text = [...axes, ...options.flatMap((option) => option.values)];
  if (text.some((value) => KIDSNOTE_OPTION_SEPARATORS.test(value))) {
    problems.push('옵션 이름이나 값에 키즈노트 구분 글자(::, $$, ^)가 있습니다.');
  }
  if (mallOptionNormalPricesDiffer(product, mall)) {
    problems.push('옵션별 정상가가 다릅니다. 키즈노트 엑셀은 옵션별 정상가를 보존할 수 없습니다.');
  }
  if (axes.length === 1) {
    const items = options.map((option) => `${option.values[0] ?? ''}$$${option.code}$$${mallOptionSalePrice(mall, option) - mall.salePrice}`);
    cells.상품옵션1 = [axes[0], '콤보박스', ...items].join('::');
    return { cells, problems, warnings };
  }
  // 단이 둘 이상이면 단마다 값 목록을 따로 만든다. 추가금액은 단품별이라 단 하나로 나눌 수 있을 때만.
  if (options.some((option) => mallOptionSalePrice(mall, option) !== mall.salePrice)) {
    problems.push('옵션이 두 단 이상이고 추가금액이 있습니다. 키즈노트 엑셀은 단마다 따로 고르게 해 조합 가격을 옮길 수 없습니다.');
  }
  axes.slice(0, 5).forEach((axis, index) => {
    const values = [...new Set(options.map((option) => option.values[index] ?? '').filter(Boolean))];
    cells[`상품옵션${index + 1}`] = [axis, '콤보박스', ...values.map((value) => `${value}$$$$0`)].join('::');
  });
  warnings.push('옵션 단이 둘 이상입니다. 키즈노트는 단마다 따로 고르므로 없는 조합도 주문될 수 있습니다.');
  return { cells, problems, warnings };
}

function commonMallNormalPrice(product: MallSheetProduct, mall: MallSheetMallValues): number | null {
  const values = mallOptions(product, mall).map((option) => mallOptionNormalPrice(mall, option));
  return values.length > 0 && values.every((value) => value !== null && value === values[0]) ? values[0]! : null;
}
