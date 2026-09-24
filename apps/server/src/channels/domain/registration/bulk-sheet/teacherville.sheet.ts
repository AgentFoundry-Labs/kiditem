import {
  detailImageUrls,
  hasDetail,
  isPublicImageUrl,
  isSingleOption,
  mallCommonOptionNormalPrice,
  mallCommonOptionSupplyPrice,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 티쳐몰(퍼스트몰 입점사) 상품 엑셀 등록 — `goodsexcel.seller.sample`(판매자 관리자 › 상품 엑셀등록,
 * 사장님이 2026-09-20 받음, https://shop.teacherville.co.kr/selleradmin/goods/excel_upload).
 *
 * 샘플은 안내 · 예시 · 구분자 행을 달고 있어 그대로 올리지 못한다. 머리행과 상품 행만 남긴 새 시트를 만든다.
 * 분류는 이름이 아니라 코드(`0001`, `00010003` …)를 줄바꿈으로 잇고 마지막 줄이 대표다 — 우리에게 코드표가 없어
 * 몰별 값의 분류 번호를 그대로 쓴다. 고시는 `이름=값` 을 `^` 로 잇고, 품목은 등록 폼과 같은 `40`(기타 재화)이다.
 */

/** 티쳐몰 고시 — 등록 폼(`teacherville-registration-form.ts`)이 쓰는 줄 중 엑셀에 넣을 것. */
const NOTICE: readonly { label: string; value: (product: MallSheetProduct, name: string, fixed: Readonly<Record<string, string>>) => string }[] = [
  { label: '품명 및 모델명', value: (_product, name) => name },
  { label: '제조사(수입자/병행수입)', value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { label: '제조국', value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { label: '취급시 주의사항', value: () => '상세설명참조' },
  { label: '품질보증기준', value: () => '관련 법 및 소비자 분쟁 해결 기준을 따름' },
  { label: 'A/S 책임자와 전화번호', value: (_product, _name, fixed) => fixed.asPhone },
  { label: '수입여부', value: () => 'Y' },
  { label: '안전인증여부', value: (product) => (product.certificationNumbers.length ? '인증' : '해당없음') },
  { label: '안전인증번호', value: (product) => product.certificationNumbers[0] ?? '해당없음' },
  { label: '색상', value: () => '상세설명참조' },
  { label: '사이즈', value: () => '상세설명참조' },
  { label: '제품 구성', value: () => '상세설명참조' },
  { label: '재질', value: () => '상세설명참조' },
  { label: '판매개수', value: () => '1EA' },
];

/** 고시 · 검색어 칸을 가르는 글자. 값에 들어 있으면 칸이 깨진다. */
const SEPARATORS = /[\^=]/;

export const teachervilleSheet: MallBulkSheetSpec = {
  sheetKey: 'teacherville',
  label: '티쳐몰',
  mallKeys: ['teacher-mall'],
  categoryBy: 'code',
  template: {
    file: 'teacherville-goodsexcel-seller-sample.xlsx',
    sheet: '통합',
    headerRow: 2,
    firstDataRow: 3,
    bookType: 'xlsx',
    emit: 'headers',
  },
  maxProducts: 200,
  fixedFields: [
    { key: 'stock', label: '재고', required: true, defaultValue: '999' },
    {
      key: 'supplyRate',
      label: '공급가 비율(%)',
      required: false,
      defaultValue: '80',
      help: '직접 입력한 공급가가 우선입니다. 없으면 확인한 비율로 파일을 만들 때 계산합니다. 비우면 몰 기본 정산을 따릅니다.',
    },
    {
      key: 'deliveryGroup',
      label: '배송그룹번호',
      required: false,
      defaultValue: '',
      help: '비우면 몰 기본 배송그룹으로 등록됩니다. 본사 위탁배송이면 `위탁`.',
    },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
  ],
  notes: [
    '티쳐몰 판매자 관리자 › 상품 › 엑셀등록(selleradmin/goods/excel_upload)에 올립니다.',
    '안내행을 지운 모양으로 만듭니다 — 첫 줄이 칸 제목, 둘째 줄부터 상품입니다.',
    '분류는 티쳐몰 코드(`0001`, `00010003`)입니다. 분류 이름(`티처몰 > 간식/선물 > 학생선물`)을 넣으면 티쳐몰 분류표(2,547개)에서 번호를 찾습니다.',
    '올린 상품은 미승인 상태로 들어가 본사 승인 뒤에 판매됩니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls['teacher-mall'];
    if (!mall) return { rows: [], problems: ['티쳐몰 값이 없습니다.'], warnings };

    if (!mall.categoryCode) {
      problems.push('티쳐몰 분류를 모릅니다 — 몰별 값에 티쳐몰 분류 이름(또는 번호)을 넣어 주세요.');
    }
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 티쳐몰 엑셀로 넣지 않습니다(필수옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (SEPARATORS.test(mall.name)) problems.push('상품명에 티쳐몰 구분 글자(^, =)가 있습니다.');
    if (problems.length) return { rows: [], problems, warnings };

    const rate = Number(fixed.supplyRate);
    const supplyPrice = mallCommonOptionSupplyPrice(product, mall)
      ?? (Number.isFinite(rate) && rate > 0 ? Math.round((mall.salePrice * rate) / 100) : null);
    const detailImages = detailImageUrls(mall.detailHtml).filter(isPublicImageUrl);
    const notice = NOTICE
      .map((field) => `${field.label}=${field.value(product, mall.name, fixed).replace(SEPARATORS, ' ')}`)
      .join('^');

    const row: MallSheetRow = {
      '*상품번호': null,
      카테고리: mall.categoryCode!,
      '*상태': '정상',
      재고에따른판매여부: '통합정책',
      노출: '노출',
      상품기본코드: product.code,
      '*상품명': mall.name,
      간략설명: mall.promoText,
      청약철회불가: '아니오',
      과세비과세: product.taxType === 'tax_free' ? '비과세' : '과세',
      성인상품: '아니오',
      검색어추가: product.keywords.filter((word) => !SEPARATORS.test(word)).join('^') || null,
      상품정보고시품목: '40',
      상품정보고시: notice,
      필수옵션타입: '분리형',
      필수옵션재고: Number(fixed.stock) || 0,
      공급가: supplyPrice,
      정가: Math.max(mallCommonOptionNormalPrice(product, mall) ?? product.tagPrice ?? 0, mall.salePrice),
      '할인가(판매가)': mall.salePrice,
      배송그룹번호: fixed.deliveryGroup?.trim() || null,
      '상품설명(PC/태블릿)': mall.detailHtml,
      상품상세이미지: detailImages.join('\n') || null,
      리스트이미지1: product.imageUrls[0]!,
      리스트이미지2: product.imageUrls[1] ?? null,
      입점사상품코드: product.code,
    };
    return { rows: [row], problems, warnings };
  },
};
