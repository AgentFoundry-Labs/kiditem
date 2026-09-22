import {
  hasDetail,
  isSingleOption,
  noticeKind,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 도매꾹 · 도매매 상품대량등록 — `itemBatchReg_v3.3.xls`(상품공급사센터 › 엑셀등록/수정, 사장님이 2026-09-20 받음).
 *
 * 칸 규칙은 도매꾹이 공개한 가이드(`excelCode_v4.10`)가 권위다. 그 가이드의 카테고리 고유번호 4,360개를 분류표로
 * 넣었고(`domeggook-categories.json.gz`), 고시 항목 · 원산지 형식도 가이드 그대로다. 파일은 Excel 97-2003(.xls)로
 * 저장해야 하고 한 파일에 1,000개까지다.
 */

/** 도매꾹 고시 항목(가이드 `상품정보제공고시 구분코드`). 번호:값 을 줄바꿈으로 잇는다. */
const CHILD_NOTICE: readonly { no: number; value: (product: MallSheetProduct, name: string, fixed: Readonly<Record<string, string>>) => string }[] = [
  { no: 1, value: (_product, name) => name },
  { no: 2, value: (product) => product.certificationNumbers[0] ?? '상세설명참조' },
  { no: 3, value: () => '상세설명참조' },
  { no: 4, value: () => '상세설명참조' },
  { no: 5, value: () => '상세설명참조' },
  { no: 6, value: () => '상세설명참조' },
  { no: 7, value: () => '해당없음' },
  { no: 8, value: () => '상세설명참조' },
  { no: 9, value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { no: 10, value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { no: 11, value: () => '상세설명참조' },
  { no: 12, value: () => '관련 법 및 소비자 분쟁 해결 기준을 따름' },
  { no: 13, value: (_product, _name, fixed) => fixed.asPhone },
];

const ETC_NOTICE: typeof CHILD_NOTICE = [
  { no: 1, value: (_product, name) => name },
  { no: 2, value: (product) => product.certificationNumbers[0] ?? '해당없음' },
  { no: 3, value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { no: 4, value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { no: 5, value: (_product, _name, fixed) => fixed.asPhone },
];

/** 거래조건 네 항목(가이드 Y 열). 몰 화면의 기본 안내와 같은 뜻으로 적는다. */
const TRADE_TERMS = [
  '1:상품 수령일로부터 7일 이내 청약철회가 가능합니다.',
  '2:상품 하자 · 오배송은 판매자 부담으로 교환 · 반품해 드립니다.',
  '3:대금 환불은 반품 확인 후 3영업일 이내에 처리합니다.',
  '4:소비자 피해 보상은 관련 법 및 소비자 분쟁 해결 기준을 따릅니다.',
].join('\n');

export const domeggookSheet: MallBulkSheetSpec = {
  sheetKey: 'domeggook',
  label: '도매꾹 · 도매매',
  mallKeys: ['domeggook'],
  categoryBy: 'code',
  template: {
    file: 'domeggook-itemBatchReg-v3.3.xls',
    sheet: '엑셀 업로드 데이터',
    headerRow: 1,
    firstDataRow: 2,
    bookType: 'xls',
  },
  maxProducts: 1000,
  fixedFields: [
    { key: 'channels', label: '판매채널', required: true, defaultValue: '도매꾹,도매매', help: '도매꾹 · 도매매 중에서(쉼표로 둘 다)' },
    { key: 'sellType', label: '판매방식', required: true, defaultValue: '직접판매', help: '직접판매 · MD홍보대행' },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'origin', label: '원산지', required: true, defaultValue: '수입산_아시아_중국', help: '가이드 `원산지코드` 시트의 분류명을 `_` 로 이음' },
    { key: 'size', label: '부피(가로,세로,높이 cm)', required: true, defaultValue: '20,20,10' },
    { key: 'weight', label: '무게', required: true, defaultValue: '300g' },
    { key: 'returnAddress', label: '반품배송지 번호', required: true, defaultValue: '', help: '출고지·반품지 관리의 `SA` 로 시작하는 7자리 번호' },
    { key: 'returnFee', label: '반품배송금액', required: true, defaultValue: '3000' },
    { key: 'shipFeeType', label: '배송비부과기준', required: true, defaultValue: '선결제:무료배송', help: '무료배송 · `선결제:수량별차등` 등 가이드 형식' },
    { key: 'shipFee', label: '배송금액', required: false, defaultValue: '', help: '무료배송이면 비웁니다. 아니면 `1:3000 20:6000` 형식' },
    { key: 'readyDays', label: '배송준비기간(일)', required: true, defaultValue: '1' },
    { key: 'listDays', label: '상품등록기간(일)', required: true, defaultValue: '365' },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
  ],
  notes: [
    '도매꾹 상품공급사센터 › 상품관리 › 엑셀등록/수정에 올립니다. 반드시 Excel 97-2003(.xls)로 저장된 파일이어야 합니다.',
    '한 파일에 1,000개까지, 하루 50번까지 올릴 수 있습니다.',
    '분류는 도매꾹 카테고리 고유번호입니다. 분류 이름을 넣으면 가이드 분류표(4,360개)에서 번호를 찾습니다.',
    '판매단가는 판매상품의 판매가를 1개 기준 단가로 넣습니다(도매꾹 · 도매매 같은 값).',
    '반품배송지 번호(SA…)는 출고지·반품지 관리에서 확인해 고정값에 넣어 주세요.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.domeggook;
    if (!mall) return { rows: [], problems: ['도매꾹 값이 없습니다.'], warnings };

    if (!mall.categoryCode) problems.push('도매꾹 카테고리 고유번호를 모릅니다 — 몰별 값에 분류 이름이나 번호를 넣어 주세요.');
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 도매꾹 엑셀로 넣지 않습니다(주문옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    const child = noticeKind(product.noticeCategory) === 'child';
    const notice = (child ? CHILD_NOTICE : ETC_NOTICE)
      .map((field) => `${field.no}:${field.value(product, mall.name, fixed).replace(/\r?\n/g, ' ')}`)
      .join('\n');
    const channels = fixed.channels.split(',').map((channel) => channel.trim()).filter(Boolean);
    const price = `1:${mall.salePrice}`;

    const row: MallSheetRow = {
      상품번호: null,
      판매채널: fixed.channels,
      판매방식: fixed.sellType,
      비공개상품: 'N',
      상품명: mall.name,
      키워드: product.keywords.slice(0, 10).map((word) => word.slice(0, 10)).join(',') || mall.name.slice(0, 10),
      카테고리고유번호: mall.categoryCode!,
      원산지: fixed.origin,
      제조사: product.manufacturer ?? '해피프랜즈',
      안전인증정보: product.certificationNumbers[0] ? `A99:${product.certificationNumbers[0]}` : 'N',
      성인인증필요여부: 'N',
      부피: fixed.size,
      무게: fixed.weight,
      공급사상품코드: product.code,
      대표이미지: product.imageUrls[0]!,
      '상품상세 / 상품정보': mall.detailHtml,
      '상세이미지 사용 허용': 'Y',
      '상품정보제공고시 구분코드': child ? 23 : 40,
      '상품정보제공고시 세부항목': notice,
      '거래조건에 관한 정보': TRADE_TERMS,
      '도매꾹 / 사업자전용상품': channels.includes('도매꾹') ? 'N' : null,
      '도매꾹 / 판매단가': channels.includes('도매꾹') ? price : null,
      '도매꾹 / 배수단위판매': channels.includes('도매꾹') ? 'N' : null,
      '도매꾹 / 가격흥정 허용': channels.includes('도매꾹') ? 'N' : null,
      '도매매 / 판매단가': channels.includes('도매매') ? price : null,
      '주문옵션 / 사용여부': 'N',
      재고수량: Number(fixed.stock) || 0,
      과세유형: product.taxType === 'tax_free' ? '면세' : '과세',
      배송방법: '택배',
      배송준비기간: Number(fixed.readyDays) || 0,
      '도매꾹 / 배송비부과기준': channels.includes('도매꾹') ? fixed.shipFeeType : null,
      '도매꾹 / 배송금액': channels.includes('도매꾹') ? fixed.shipFee?.trim() || null : null,
      '도매매 / 배송비부과기준': channels.includes('도매매') ? fixed.shipFeeType : null,
      '도매매 / 배송금액': channels.includes('도매매') ? fixed.shipFee?.trim() || null : null,
      반품배송지: fixed.returnAddress,
      반품배송금액: Number(fixed.returnFee) || 0,
      '무료배송시 왕복부과': 'N',
      상품등록기간: Number(fixed.listDays) || 365,
      // 양식 칸 이름은 `즉시진열여부`다(가이드는 상품진열여부로 적는다).
      즉시진열여부: 'Y',
    };
    return { rows: [row], problems, warnings };
  },
};
