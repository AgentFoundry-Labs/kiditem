import {
  hasDetail,
  isSingleOption,
  type MallBulkSheetSpec,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 롯데ON 일괄등록 — `batchInsert_SO_Lotte.xlsx`(셀러 어드민 › 상품 일괄등록, 사장님이 2026-09-20 받음).
 *
 * 1행은 묶음 제목, 2행이 칸 이름, 3행 필수 표시, 4행 예시다. 안내 · 예시 행을 비우고 5행부터 상품을 쓴다.
 * 분류는 롯데ON 표준카테고리 번호(`BC…`)이고, 사장님이 받아 준 표준카테고리 리스트 5,154개로 이름을 번호로 바꾼다.
 * 사진과 상세설명은 주소로 들어간다 — 상세설명 칸은 HTML 이다.
 */
export const lotteonSheet: MallBulkSheetSpec = {
  sheetKey: 'lotte-on',
  label: '롯데ON',
  mallKeys: ['lotte-on'],
  categoryBy: 'code',
  template: {
    file: 'lotteon-batchInsert-SO.xlsx',
    sheet: '롯데온 일괄등록',
    headerRow: 2,
    firstDataRow: 5,
    bookType: 'xlsx',
    clearRows: [3, 4],
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'originCode', label: '원산지코드', required: true, defaultValue: 'CN', help: 'CN = 중국(양식의 `참조1.원산지코드` 시트)' },
    { key: 'productType', label: '상품유형', required: true, defaultValue: '일반판매_일반상품' },
    { key: 'shipMethod', label: '배송처리수단', required: true, defaultValue: '일반택배' },
    { key: 'shipType', label: '배송상품유형', required: true, defaultValue: '일반상품' },
    { key: 'shipDays', label: '최대발송예정일', required: true, defaultValue: '2', help: '0 · 1 · 2 · 3 … 일' },
    { key: 'courierCode', label: '택배사코드', required: false, defaultValue: '', help: '양식의 `참조3.택배사코드` 시트에서 CJ대한통운 번호' },
    { key: 'shipArea', label: '배송권역그룹', required: true, defaultValue: '전국' },
    { key: 'asGuide', label: 'A/S 안내', required: true, defaultValue: '031-908-5401' },
  ],
  notes: [
    '롯데ON 셀러 어드민 › 상품 › 상품 일괄등록에 올립니다. 안내 · 예시 행은 비워서 만듭니다(5행부터 상품).',
    '분류는 롯데ON 표준카테고리 번호입니다. 분류 이름을 넣으면 표준카테고리 리스트(5,154개)에서 번호를 찾습니다.',
    '사진 · 상세설명은 주소로 들어갑니다 — 우리 저장소 사진은 [사진 올리기]로 공개 주소를 먼저 만드세요.',
    '딜크릿 · MPB 상품여부는 `N (대상아님)`으로 넣습니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls['lotte-on'];
    if (!mall) return { rows: [], problems: ['롯데ON 값이 없습니다.'], warnings };

    if (!mall.categoryCode) problems.push('롯데ON 표준카테고리 번호를 모릅니다 — 몰별 값에 분류 이름이나 번호를 넣어 주세요.');
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 롯데ON 엑셀로 넣지 않습니다(옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    const row: MallSheetRow = {
      '판매자 상품코드': product.code,
      카테고리코드: mall.categoryCode!,
      상품명: mall.name,
      판매가: mall.salePrice,
      재고수량: Number(fixed.stock) || 0,
      대표이미지: product.imageUrls[0]!,
      추가이미지: product.imageUrls.slice(1, 10).join(',') || null,
      상세설명: mall.detailHtml,
      'A/S 안내': fixed.asGuide,
      상품유형: fixed.productType,
      부가세: product.taxType === 'tax_free' ? '면세' : '과세',
      원산지코드: fixed.originCode,
      제조사: product.manufacturer,
      상품상태: '새상품',
      '미성년자 구매': '전연령 구매가능',
      인증번호: product.certificationNumbers[0] ?? null,
      해외배송여부: '국내배송',
      배송처리수단: fixed.shipMethod,
      배송상품유형: fixed.shipType,
      최대발송예정일: Number(fixed.shipDays) || 0,
      배송권역그룹: fixed.shipArea,
      택배사코드: fixed.courierCode?.trim() || null,
      판매자바코드: product.options[0]?.barcode ?? null,
      '딜크릿 상품여부': 'N (대상아님)',
      'MPB 상품여부': 'N (대상아님)',
    };
    return { rows: [row], problems, warnings };
  },
};
