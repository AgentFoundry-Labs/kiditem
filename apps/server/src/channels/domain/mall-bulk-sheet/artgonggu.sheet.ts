import {
  hasDetail,
  isSingleOption,
  mallCommonOptionNormalPrice,
  type MallBulkSheetSpec,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 아트공구(카페24) 상품 엑셀 등록 — `excelUploadProductDefault.csv`(쇼핑몰 관리자 › 상품 › 엑셀관리,
 * 사장님이 2026-09-20 받음).
 *
 * 카페24는 CSV 로 올린다(첫 줄 칸 이름, 둘째 줄부터 상품). 분류는 카페24 상품분류 번호(`cate_no`)이고, 사진은
 * 이미지 주소를 넣으면 카페24가 받아 간다. 옵션 · FTP 사진은 아직 넣지 않는다.
 */
export const artgongguSheet: MallBulkSheetSpec = {
  sheetKey: 'artgonggu',
  label: '아트공구',
  mallKeys: ['art09'],
  categoryBy: 'code',
  template: {
    file: 'artgonggu-excelUploadProductDefault.csv',
    sheet: 'Sheet1',
    headerRow: 1,
    firstDataRow: 2,
    bookType: 'csv',
    emit: 'headers',
  },
  maxProducts: 1000,
  fixedFields: [
    { key: 'stock', label: '재고수량', required: false, defaultValue: '999', help: '카페24는 재고를 옵션에서 관리합니다 — 지금은 참고용입니다.' },
    { key: 'originCode', label: '원산지 코드', required: true, defaultValue: '1798', help: '양식 예시와 같은 카페24 원산지 번호' },
    { key: 'taxType', label: '과세구분', required: true, defaultValue: 'A|10', help: 'A 과세 · B 면세, `|` 뒤는 부가세율' },
    { key: 'supplier', label: '공급사 코드', required: false, defaultValue: '', help: '비우면 자사 상품으로 등록됩니다.' },
  ],
  notes: [
    '아트공구(카페24) 관리자 › 상품 › 엑셀관리 › 상품 등록에 올립니다. CSV(UTF-8)로 만듭니다.',
    '분류는 카페24 상품분류 번호(cate_no)입니다 — 몰별 값에 번호를 넣어 주세요(분류표는 아직 없습니다).',
    '사진은 이미지 주소로 넣습니다. FTP 파일명으로 올리려면 몰 화면에서 따로 올려야 합니다.',
    '옵션 있는 상품은 아직 넣지 않습니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.art09;
    if (!mall) return { rows: [], problems: ['아트공구 값이 없습니다.'], warnings };

    if (!mall.categoryCode) problems.push('아트공구 상품분류 번호를 모릅니다 — 몰별 값에 번호를 넣어 주세요.');
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 아트공구 엑셀로 넣지 않습니다(옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    const image = product.imageUrls[0]!;
    const row: MallSheetRow = {
      상품코드: null,
      '자체 상품코드': product.code,
      진열상태: 'Y',
      판매상태: 'Y',
      '상품분류 번호': mall.categoryCode!,
      상품명: mall.name,
      '상품명(관리용)': product.internalName,
      모델명: product.modelName,
      '상품 상세설명': mall.detailHtml,
      검색어설정: product.keywords.join(',') || null,
      과세구분: fixed.taxType,
      소비자가: Math.max(mallCommonOptionNormalPrice(product, mall) ?? product.tagPrice ?? 0, mall.salePrice),
      판매가: mall.salePrice,
      옵션사용: 'N',
      '이미지등록(상세)': image,
      '이미지등록(목록)': image,
      '이미지등록(작은목록)': image,
      '이미지등록(축소)': image,
      '이미지등록(추가)': product.imageUrls.slice(1, 10).join('|') || null,
      제조사: product.manufacturer,
      브랜드: product.brand,
      공급사: fixed.supplier?.trim() || null,
      원산지: fixed.originCode,
      성인인증: 'N',
    };
    return { rows: [row], problems, warnings };
  },
};
