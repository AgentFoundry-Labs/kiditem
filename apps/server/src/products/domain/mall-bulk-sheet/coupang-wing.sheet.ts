import {
  detailImageUrls,
  isPublicImageUrl,
  isSingleOption,
  optionLabel,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetOption,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';
import type { CoupangCategory } from './mall-sheet-categories';

/**
 * 쿠팡 WING 상품 일괄등록 — `sellertool_upload.xlsm` Ver.4.6(윙 › 상품 일괄등록 › 엑셀양식 다운로드, 2026-09-20 받음).
 *
 * `data` 시트, 1~4행은 두고 5행부터 쓴다. 한 줄이 단품(옵션 조합) 하나다. Ver.4.5 와 달리 G열이 `브랜드 ID`
 * (없으면 `브랜드 없음`)이고, 모델번호 · 바코드 칸이 빠진 자리에 `인증∙신고 등` 칸이 왔다 — 저장소의 옛 양식으로
 * 만든 파일은 쿠팡이 받지 않는다(2026-01-31 개편 공지).
 *
 * 구매옵션 칸은 카테고리마다 다르다(전체 카테고리 입력정보 파일에서 읽은 표). 옵션 이름은 첫 번째 직접입력형 칸에,
 * 수량 단위형 칸에는 `1개` 를 넣는다. 고시는 모든 카테고리가 받는 `기타 재화` 로 넣는다.
 */

const NOTICE_OTHER = '기타 재화';

export const coupangWingSheet: MallBulkSheetSpec = {
  sheetKey: 'coupang',
  label: '쿠팡 윙',
  mallKeys: ['coupang'],
  categoryBy: 'code',
  template: {
    file: 'coupang-wing-sellertool_upload-v4.6.xlsm',
    sheet: 'data',
    headerRow: 2,
    firstDataRow: 5,
    bookType: 'xlsm',
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'brandId', label: '브랜드 ID', required: true, defaultValue: '브랜드 없음', help: '쿠팡 브랜드 관리의 ID. 없으면 "브랜드 없음"' },
    { key: 'leadTime', label: '출고리드타임(일)', required: true, defaultValue: '2' },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'asPhone', label: '소비자상담 전화번호', required: true, defaultValue: '031-908-5401' },
    { key: 'certType', label: '인증∙신고 등 정보유형', required: true, defaultValue: '상세정보별도표기', help: '인증 정보는 상세설명에 싣는다' },
  ],
  notes: [
    '윙 › 상품관리 › 상품 일괄등록 › [엑셀파일 업로드 요청]에 올립니다(엑셀 버전 Ver.4.6). 배송 · 반품지는 업로드 화면에서 고릅니다.',
    '상세설명은 상세설명 안의 사진 주소를 쉼표로 이어 넣습니다.',
    '고시는 기타 재화로 넣습니다. 카테고리에 따라 다른 고시만 받으면 실패 사유에 나옵니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.coupang;
    if (!mall) return { rows: [], problems: ['쿠팡 값이 없습니다.'], warnings };

    const category = context.categories.coupang(mall.categoryCode);
    if (!category) {
      problems.push(`쿠팡 카테고리 번호를 모릅니다${mall.categoryPath ? ` (${mall.categoryPath})` : ''} — 몰별 값에 번호를 넣어 주세요.`);
    }
    // 등록상품명은 발주서에만 쓰는 판매자 관리용 이름이라 셀피아 원본명(가격 코드 포함)을 쓴다 — 기존 등록 관례.
    const name = (mall.nameIsMallSpecific ? mall.name : product.internalName).trim();
    if (name.length > 100) problems.push(`등록상품명이 100자를 넘습니다: ${name.length}자.`);
    if (mall.salePrice < 10) problems.push('판매가가 10원보다 적습니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    const detailImages = detailImageUrls(mall.detailHtml).filter(isPublicImageUrl);
    if (!detailImages.length) problems.push('상세설명에 인터넷에서 열리는 사진이 없습니다(쿠팡 상세설명은 사진입니다).');
    const maker = (product.manufacturer?.trim() || product.brand?.trim() || '').slice(0, 20);
    if (!maker) problems.push('제조사가 비어 있습니다.');

    const options = category ? purchaseOptionPlan(product, category) : { assign: null, problems: [], warnings: [] };
    problems.push(...options.problems);
    warnings.push(...options.warnings);
    if (problems.length || !category || !options.assign) return { rows: [], problems, warnings };

    const stock = Number(fixed.stock) || 999;
    const keywords = product.keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword && keyword.length <= 20).slice(0, 20);
    const origin = originCountryName(product.originCountry) ?? '상세설명참조';
    const rows = product.options.map((option): MallSheetRow => {
      const price = mall.salePrice + option.extraPrice;
      return {
        카테고리: `[${category.code}] ${category.path}`,
        등록상품명: name,
        '브랜드 ID': fixed.brandId,
        제조사: maker,
        검색어: keywords.join('/') || null,
        ...options.assign!(option),
        판매가격: price,
        할인율기준가: Math.max(product.tagPrice ?? 0, price),
        재고수량: stock,
        출고리드타임: Number(fixed.leadTime) || 2,
        '성인상품(19)': 'N',
        과세여부: product.taxType === 'tax_free' ? 'N' : 'Y',
        병행수입여부: 'N',
        해외구매대행: 'N',
        업체상품코드: option.code,
        '인증∙신고 등정보유형': fixed.certType,
        '상품고시정보 카테고리': NOTICE_OTHER,
        // 기타 재화: 품명 및 모델명 · 인증/허가 사항 · 제조국(원산지) · 제조자(수입자) · 소비자상담 관련 전화번호
        상품고시정보값1: mall.name.trim(),
        상품고시정보값2: product.certificationNumbers[0] ?? '해당없음',
        상품고시정보값3: origin,
        상품고시정보값4: maker,
        상품고시정보값5: fixed.asPhone,
        '대표(옵션)이미지': product.imageUrls[0]!,
        추가이미지: product.imageUrls.slice(1, 10).join(',') || null,
        '상세 설명': detailImages.join(','),
      };
    });
    return { rows, problems, warnings };
  },
};

/**
 * 카테고리 구매옵션 칸에 무엇을 넣을지. 옵션 이름은 첫 직접입력형 칸(색상 · 사이즈 · 모델명 …)에, 수량 단위형
 * 칸에는 `1개` 를 넣는다. 채울 수 없는 필수 칸(중량 · 용량 같은 다른 단위형)이 있으면 올리지 않는다.
 */
function purchaseOptionPlan(product: MallSheetProduct, category: CoupangCategory): {
  assign: ((option: MallSheetOption) => MallSheetRow) | null;
  problems: string[];
  warnings: string[];
} {
  const problems: string[] = [];
  const warnings: string[] = [];
  const types = category.purchaseOptions.slice(0, 6);
  const textTypes = types.filter((type) => !type.unit);
  const single = isSingleOption(product);
  const labelType = textTypes[0] ?? null;
  if (!single && !labelType) {
    problems.push(`쿠팡 카테고리(${category.path})가 옵션 이름을 받는 칸 없이 ${types.map((type) => type.name).join(' · ')}만 받습니다.`);
  }
  for (const type of types) {
    if (!type.required || type === labelType || !type.unit) continue;
    if (type.unit !== '개' && !type.pickOne) {
      problems.push(`쿠팡 카테고리의 필수 구매옵션 '${type.name}'(${type.unit})을 채울 값이 없습니다.`);
    }
  }
  if (types.some((type) => type.required && type.pickOne) && !types.some((type) => type.pickOne && type.unit === '개')) {
    problems.push(`쿠팡 카테고리의 '(택1)' 구매옵션(${types.filter((type) => type.pickOne).map((type) => type.name).join(' · ')})을 채울 값이 없습니다.`);
  }
  const otherText = textTypes.filter((type) => type !== labelType && type.required);
  if (otherText.length) warnings.push(`쿠팡 필수 구매옵션 ${otherText.map((type) => `'${type.name}'`).join(' · ')}에 '상세페이지 참조'를 넣습니다.`);
  if (problems.length) return { assign: null, problems, warnings };

  return {
    assign: (option) => {
      const cells: Record<string, string | null> = {};
      types.forEach((type, index) => {
        let value: string | null = null;
        if (type === labelType) value = single ? '상세페이지 참조' : optionLabel(option) || '상세페이지 참조';
        else if (type.unit === '개') value = '1개';
        else if (!type.unit && type.required) value = '상세페이지 참조';
        cells[`옵션유형${index + 1}`] = value === null ? null : type.name;
        cells[`옵션값${index + 1}`] = value;
      });
      return cells;
    },
    problems,
    warnings,
  };
}
