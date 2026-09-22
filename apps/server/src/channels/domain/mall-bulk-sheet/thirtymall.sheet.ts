import {
  detailImageUrls,
  hasDetail,
  isPublicImageUrl,
  isSingleOption,
  noticeKind,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 떠리몰(샵바이 파트너) 상품 대량등록 — `떠리몰_상품대량등록_업로드양식`(파트너 어드민, 사장님이 2026-09-20 받음).
 *
 * 양식은 안내행(1 · 3 · 4행)을 지우고 올리라고 한다. 그래서 머리행과 상품 행만 남긴 새 시트를 만든다(`emit: 'headers'`).
 * 표준카테고리 · 원산지 · 고시 품목은 양식이 함께 준 시트의 번호를 쓴다(`thirtymall-categories.json.gz`).
 * 사진은 `종류^|^주소` 를 줄바꿈으로 이어 한 칸에 넣는다(main · list · add_1~14 · detail_1~9).
 */

/** 떠리몰 고시 품목(양식의 `상품정보제공고시` 시트) — 어린이제품 13칸 · 기타 재화 5칸. */
const CHILD_NOTICE: readonly { label: string; value: (product: MallSheetProduct, name: string, fixed: Readonly<Record<string, string>>) => string }[] = [
  { label: '품목 및 모델명', value: (_product, name) => name },
  { label: 'KC 인증정보', value: (product) => product.certificationNumbers[0] ?? '상세설명참조' },
  { label: '크기, 중량', value: () => '상세설명참조' },
  { label: '색상', value: () => '상세설명참조' },
  { label: '재질', value: () => '상세설명참조' },
  { label: '사용연령', value: () => '상세설명참조' },
  { label: '크기·체중의 한계', value: () => '해당없음' },
  { label: '동일모델의 출시년월', value: () => '상세설명참조' },
  { label: '제조자', value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { label: '제조국', value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { label: '취급방법 및 주의사항', value: () => '상세설명참조' },
  { label: '품질보증기준', value: () => '관련 법 및 소비자 분쟁 해결 기준을 따름' },
  { label: 'A/S 책임자와 전화번호', value: (_product, _name, fixed) => fixed.asPhone },
];

const ETC_NOTICE: typeof CHILD_NOTICE = [
  { label: '품명 및 모델명', value: (_product, name) => name },
  { label: '인증·허가', value: (product) => product.certificationNumbers[0] ?? '해당없음' },
  { label: '제조국 또는 원산지', value: (product) => originCountryName(product.originCountry) ?? '상세설명참조' },
  { label: '제조자', value: (product) => product.manufacturer?.trim() || '상세설명참조' },
  { label: 'A/S 책임자와 전화번호', value: (_product, _name, fixed) => fixed.asPhone },
];

/** 떠리몰 고시 품목 번호(양식 시트 그대로). */
const NOTICE_TYPE = { child: '23', other: '40' } as const;

export const thirtymallSheet: MallBulkSheetSpec = {
  sheetKey: 'thirtymall',
  label: '떠리몰',
  mallKeys: ['thirtymall'],
  categoryBy: 'code',
  template: {
    file: 'thirtymall-bulk-upload-20260920.xlsx',
    sheet: 'Sheet1',
    headerRow: 2,
    firstDataRow: 5,
    bookType: 'xlsx',
    emit: 'headers',
  },
  maxProducts: 100,
  fixedFields: [
    {
      key: 'manager',
      label: '담당자(운영자번호)',
      required: true,
      defaultValue: '',
      help: '양식의 `담당자` 시트에서 우리 담당 MD 운영자번호를 찾아 넣으세요(필수 칸).',
    },
    { key: 'stock', label: '재고수량', required: true, defaultValue: '999' },
    { key: 'originCode', label: '원산지 코드', required: true, defaultValue: '40037', help: '40037 = 수입산 > 아시아 > 중국' },
    {
      key: 'deliveryTemplate',
      label: '배송템플릿 번호',
      required: false,
      defaultValue: '',
      help: '비우면 몰 기본 배송템플릿으로 등록됩니다(파트너배송 예: 699218 기본-고정배송비).',
    },
    { key: 'deliveryType', label: '배송구분', required: true, defaultValue: '2', help: '1 쇼핑몰배송 · 2 파트너배송' },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
  ],
  notes: [
    '떠리몰 파트너 어드민 › 상품 › 상품 대량등록에 올립니다. 한 번에 100개까지입니다.',
    '안내행을 지운 모양으로 만듭니다 — 첫 줄이 칸 제목, 둘째 줄부터 상품입니다.',
    '표준카테고리 번호는 양식이 함께 준 분류표에서 찾습니다. 없는 경로는 몰별 값에 번호를 직접 넣어 주세요.',
    '사진 · 상세 이미지는 주소로 들어갑니다. 우리 저장소 사진은 [사진 올리기]로 공개 주소를 먼저 만드세요.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.thirtymall;
    if (!mall) return { rows: [], problems: ['떠리몰 값이 없습니다.'], warnings };

    if (!mall.categoryCode) problems.push('떠리몰 표준카테고리 번호를 모릅니다 — 몰별 값에 번호를 넣어 주세요.');
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (mall.salePrice % 10 !== 0) problems.push('떠리몰 판매가는 10원 단위여야 합니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 떠리몰 엑셀로 넣지 않습니다(조합형 옵션 칸은 라이브 확인 뒤에 엽니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    const detailImages = detailImageUrls(mall.detailHtml).filter(isPublicImageUrl).slice(0, 9);
    if (detailImages.length === 0) warnings.push('상세 이미지 주소가 없어 상품상세가 비어 있습니다. 올린 뒤 몰에서 상세를 넣으세요.');
    const images = [
      `main^|^${product.imageUrls[0]!}`,
      `list^|^${product.imageUrls[0]!}`,
      ...product.imageUrls.slice(1, 15).map((url, index) => `add_${index + 1}^|^${url}`),
      ...detailImages.map((url, index) => `detail_${index + 1}^|^${url}`),
    ].join('\n');

    const child = noticeKind(product.noticeCategory) === 'child';
    const notice = (child ? CHILD_NOTICE : ETC_NOTICE).map((field) => field.value(product, mall.name, fixed));
    const noticeCells: Record<string, string | null> = {};
    for (let index = 0; index < 14; index += 1) {
      noticeCells[`상품정보고시 항목${index + 1}`] = notice[index] ?? null;
    }

    const row: MallSheetRow = {
      상품군: '1',
      담당자: fixed.manager,
      표준카테고리: mall.categoryCode!,
      상품명: mall.name,
      검색어: product.keywords.slice(0, 30).join(',') || null,
      성인인증: 'N',
      장바구니: 'Y',
      '판매기간 설정': '1',
      판매가: mall.salePrice,
      재고수량: Number(fixed.stock) || 0,
      '조합형옵션 사용여부': 'N',
      '인증정보 등록구분': product.certificationNumbers.length ? '3' : '2',
      원산지: fixed.originCode,
      제조사: product.manufacturer,
      부가세: product.taxType === 'tax_free' ? '2' : '1',
      상품관리코드: product.code,
      상품이미지: images,
      배송여부: 'Y',
      배송구분: fixed.deliveryType,
      배송템플릿: fixed.deliveryTemplate?.trim() || null,
      '상품정보고시 사용여부': 'Y',
      '상품정보고시 유형': child ? NOTICE_TYPE.child : NOTICE_TYPE.other,
      ...noticeCells,
    };
    return { rows: [row], problems, warnings };
  },
};
