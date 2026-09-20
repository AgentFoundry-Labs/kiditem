import {
  detailImageUrls,
  hasDetail,
  isPublicImageUrl,
  isSingleOption,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 스마트스토어 상품 일괄등록 — `ExcelSaveTemplate`(스마트스토어센터 › 상품관리 › 상품 일괄등록,
 * 사장님이 2026-09-20 받음).
 *
 * 1행은 묶음 제목, 2행이 칸 이름이고 3~6행은 작성 가이드다. 양식이 "파일 업로드 시 3~6행의 작성가이드는
 * 삭제하라"고 해서 3행부터 상품으로 덮어쓴다.
 *
 * 카테고리 · 원산지는 센터 팝업에서만 확인되는 번호라 분류표가 없다 — 몰별 값에 번호를 넣어야 한다. 배송 · 고시 ·
 * A/S 는 템플릿코드를 넣으면 오른쪽 칸을 몰이 무시하므로, 템플릿코드가 있으면 그것만 넣는다.
 */
export const smartstoreSheet: MallBulkSheetSpec = {
  sheetKey: 'smartstore',
  label: '스마트스토어',
  mallKeys: ['smartstore'],
  categoryBy: 'code',
  template: {
    file: 'smartstore-ExcelSaveTemplate-20260324.xlsx',
    sheet: '일괄등록',
    headerRow: 2,
    firstDataRow: 3,
    bookType: 'xlsx',
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'originCode', label: '원산지코드', required: true, defaultValue: '', help: '상품등록 화면의 `원산지 찾기` 팝업 코드(수입산 > 중국)' },
    { key: 'importer', label: '수입사', required: false, defaultValue: '', help: '원산지가 수입산이면 필수' },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'shipTemplate', label: '배송비 템플릿코드', required: false, defaultValue: '', help: '템플릿관리 › 배송비 템플릿. 넣으면 아래 배송 칸은 몰이 무시합니다.' },
    { key: 'courierCode', label: '택배사코드', required: true, defaultValue: 'CJGLS', help: '배송비 템플릿코드가 없을 때 씁니다.' },
    { key: 'shipFee', label: '기본배송비', required: true, defaultValue: '3000' },
    { key: 'freeOver', label: '조건부무료 기준금액', required: true, defaultValue: '30000', help: '이 금액 이상 사면 무료배송' },
    { key: 'returnFee', label: '반품배송비', required: true, defaultValue: '3000' },
    { key: 'exchangeFee', label: '교환배송비', required: true, defaultValue: '6000' },
    { key: 'noticeTemplate', label: '고시 템플릿코드', required: false, defaultValue: '', help: '넣으면 고시 품명~제조자 칸은 몰이 무시합니다.' },
    { key: 'asTemplate', label: 'A/S 템플릿코드', required: false, defaultValue: '' },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
    { key: 'asGuide', label: 'A/S 안내', required: true, defaultValue: '평일 09:00~18:00 (점심 12:00~13:00), 주말 · 공휴일 휴무' },
  ],
  notes: [
    '스마트스토어센터 › 상품관리 › 상품 일괄등록에 올립니다. 작성 가이드 행(3~6행)은 빼고 만듭니다.',
    '카테고리코드는 상품등록 화면의 `카테고리 찾기` 번호입니다 — 분류표가 없어 몰별 값에 번호를 넣어 주세요.',
    '원산지코드도 `원산지 찾기` 팝업 번호입니다. 한 번 넣으면 고정값으로 기억합니다.',
    '배송 · 고시 · A/S 템플릿코드를 넣으면 그 템플릿으로 등록되고 오른쪽 칸은 무시됩니다.',
    '판매가는 10원 단위만 받습니다. 사진은 주소를 넣으면 몰이 올릴 때 받아 갑니다(640×640 권장).',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.smartstore;
    if (!mall) return { rows: [], problems: ['스마트스토어 값이 없습니다.'], warnings };

    if (!mall.categoryCode) problems.push('스마트스토어 카테고리코드를 모릅니다 — 몰별 값에 번호를 넣어 주세요.');
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (mall.salePrice % 10 !== 0) problems.push(`판매가 ${mall.salePrice.toLocaleString()}원은 10원 단위가 아닙니다.`);
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 스마트스토어 엑셀로 넣지 않습니다(옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    if (detailImageUrls(mall.detailHtml).some((url) => !isPublicImageUrl(url))) {
      warnings.push('상세설명 안에 몰이 못 읽는 사진 주소가 있습니다. [사진 올리기]로 공개 주소를 먼저 만드세요.');
    }
    const shipByTemplate = Boolean(fixed.shipTemplate?.trim());
    const noticeByTemplate = Boolean(fixed.noticeTemplate?.trim());
    const asByTemplate = Boolean(fixed.asTemplate?.trim());

    const row: MallSheetRow = {
      '판매자 상품코드': product.code,
      카테고리코드: mall.categoryCode!,
      상품명: mall.name.slice(0, 100),
      상품상태: '신상품',
      판매가: mall.salePrice,
      부가세: product.taxType === 'tax_free' ? '면세상품' : '과세상품',
      재고수량: Number(fixed.stock) || 0,
      대표이미지: product.imageUrls[0]!,
      추가이미지: product.imageUrls.slice(1, 10).join('\n') || null,
      상세설명: mall.detailHtml,
      브랜드: product.brand,
      제조사: product.manufacturer,
      원산지코드: fixed.originCode,
      수입사: fixed.importer?.trim() || null,
      복수원산지여부: 'N',
      '미성년자 구매': 'Y',
      '배송비 템플릿코드': shipByTemplate ? fixed.shipTemplate : null,
      배송방법: shipByTemplate ? null : '택배, 소포, 등기',
      택배사코드: shipByTemplate ? null : fixed.courierCode,
      배송비유형: shipByTemplate ? null : '조건부 무료',
      기본배송비: shipByTemplate ? null : Number(fixed.shipFee) || 0,
      '배송비 결제방식': shipByTemplate ? null : '선결제',
      '조건부무료- 상품판매가 합계': shipByTemplate ? null : Number(fixed.freeOver) || 0,
      반품배송비: shipByTemplate ? null : Number(fixed.returnFee) || 0,
      교환배송비: shipByTemplate ? null : Number(fixed.exchangeFee) || 0,
      별도설치비: 'N',
      '상품정보제공고시 템플릿코드': noticeByTemplate ? fixed.noticeTemplate : null,
      '상품정보제공고시 품명': noticeByTemplate ? null : mall.name.slice(0, 50),
      '상품정보제공고시 모델명': noticeByTemplate ? null : product.modelName ?? mall.name.slice(0, 50),
      '상품정보제공고시 인증허가사항': noticeByTemplate ? null : product.certificationNumbers[0] ?? null,
      '상품정보제공고시 제조자': noticeByTemplate
        ? null
        : product.manufacturer ?? originCountryName(product.originCountry) ?? null,
      'A/S 템플릿코드': asByTemplate ? fixed.asTemplate : null,
      'A/S 전화번호': asByTemplate ? null : fixed.asPhone,
      'A/S 안내': asByTemplate ? null : fixed.asGuide,
      판매자바코드: product.options[0]?.barcode ?? null,
    };
    return { rows: [row], problems, warnings };
  },
};
