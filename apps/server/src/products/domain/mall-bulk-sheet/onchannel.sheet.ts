import {
  hasDetail,
  isSingleOption,
  noticeKind,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 온채널 대량 상품등록 — `excel_upload_form_v1.1.xlsx`(공급사센터 › 엑셀 대기상품 관리,
 * 사장님이 2026-09-20 받음).
 *
 * 1행이 칸 이름, 2 · 3행은 필수 표시와 안내, 4행이 예시다. 양식이 "4행의 예시만 지우고 올리라"고 해서 2 · 3행은
 * 그대로 두고 4행부터 상품을 쓴다.
 *
 * 값은 확장이 실제로 등록해 본 온채널 폼과 같은 값이다(CJ 대한통운 · 3,000/제주 4,000/도서 5,000 · 제조사 ·
 * 가격자율). **공급가만은 우리 데이터에 없다** — 온채널과의 거래 조건이라 사람이 몰별 값에 넣는다.
 */

/** 온채널 코드(양식의 참조 시트). */
const NOTICE_CHILD = 17; // 영유아용품
const NOTICE_ETC = 26; // 기타
const TAX = { taxable: 1, tax_free: 2, zero_rated: 3 } as const;

export const onchannelSheet: MallBulkSheetSpec = {
  sheetKey: 'onch',
  label: '온채널',
  mallKeys: ['onch'],
  categoryBy: 'code',
  // 온채널 분류 번호는 네이버 번호 그대로다 — 온채널 분류가 없으면 스마트스토어 분류를 쓴다.
  categorySharesWith: ['smartstore'],
  template: {
    file: 'onch-excel-upload-form-v1.1.xlsx',
    sheet: '양식',
    headerRow: 1,
    firstDataRow: 4,
    bookType: 'xlsx',
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'courier', label: '택배사 코드', required: true, defaultValue: '38', help: '38 = CJ 대한통운(양식의 `택배사 코드` 시트)' },
    { key: 'shipFee', label: '배송비', required: true, defaultValue: '3000' },
    { key: 'jejuFee', label: '제주도 추가배송비', required: true, defaultValue: '4000' },
    { key: 'islandFee', label: '도서산간 추가배송비', required: true, defaultValue: '5000' },
    { key: 'sendInfo', label: '배송마감/발송처/발송일', required: true, defaultValue: '오후 1시/제조사/2~3일' },
    {
      key: 'returnGuide',
      label: '반품안내',
      required: true,
      defaultValue:
        '반품/교환시 공급사에서 직접 수거접수하는 업체이며, 단순변심으로 인한 반품시 왕복배송비 6,000원 / '
        + '반품시 본 박스 훼손시 반품 불가합니다.',
    },
    { key: 'qtyShip', label: '수량별 배송비 적용', required: true, defaultValue: 'N', help: 'Y 적용 · N 미적용' },
    { key: 'qtyShipBase', label: '수량별 배송비 기준 수량', required: true, defaultValue: '1' },
    { key: 'supplierType', label: '공급업체 분류', required: true, defaultValue: '1', help: '1 제조사 · 2 벤더사 · 3 수입사' },
    { key: 'priceRule', label: '판매가준수여부', required: true, defaultValue: '1', help: '1 가격자율 · 3 가격준수(가격준수면 최종준수가는 공급가×1.4 이상)' },
    { key: 'kcType', label: 'KC 인증유형', required: true, defaultValue: '26', help: '26 = [어린이제품]안전확인(양식의 `KC 인증유형 구분 코드` 시트)' },
    { key: 'kcAgency', label: 'KC 인증기관', required: true, defaultValue: 'FITI시험연구원' },
    { key: 'kcName', label: 'KC 인증상호', required: true, defaultValue: 'KY I&D' },
    { key: 'maker', label: '제조사/소재지/수입자', required: true, defaultValue: 'KY I&D/중국/KY I&D' },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
    { key: 'deliverDays', label: '주문후 예상 배송기간', required: true, defaultValue: '2~3일' },
    { key: 'makeYmd', label: '제조년월일', required: true, defaultValue: '해당년월일' },
    { key: 'sizeWeight', label: '크기/무게/용량', required: true, defaultValue: '상세페이지참조' },
    { key: 'color', label: '색상', required: true, defaultValue: '랜덤' },
    { key: 'material', label: '제품 주요 소재', required: false, defaultValue: '플라스틱외' },
  ],
  notes: [
    '온채널 공급사센터 › 엑셀 대기상품 관리에 올립니다. 예시 행(4행)만 지운 양식이라 안내행 2 · 3행은 그대로 둡니다.',
    '⚠️ 올린 뒤 **승인 요청**을 해야 합니다. 등록만 하고 두면 익일 23:59 에 지워집니다.',
    '공급가는 우리 데이터에 없습니다 — 몰별 값 `supplyPrice` 에 넣어 주세요(판매가에서 역산하지 않습니다). 판매사가는 온채널이 공급가로 계산합니다.',
    '분류는 온채널 카테고리 번호이고, 네이버 분류 번호와 같습니다(양식의 `카테고리분류코드` 시트 4,967개).',
    '제목(키워드)은 5개 이상이어야 합니다. 상품명은 폼 등록과 같게 `이름 (구성수량개) 첫 키워드` 로 만듭니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls.onch;
    if (!mall) return { rows: [], problems: ['온채널 값이 없습니다.'], warnings };

    const supplyPrice = Number(mall.values.supplyPrice?.replace(/[,\s]/g, '') ?? '');
    const pack = Math.max(1, Number(mall.values.packQuantity ?? '1') || 1);
    if (!mall.categoryCode) problems.push('온채널 분류 번호를 모릅니다 — 몰별 값에 분류 이름이나 번호를 넣어 주세요.');
    if (!Number.isFinite(supplyPrice) || supplyPrice <= 0) {
      problems.push('온채널 공급가가 없습니다 — 몰별 값 `supplyPrice` 에 넣어 주세요(판매가에서 역산하지 않습니다).');
    }
    if (product.keywords.length < 5) problems.push(`키워드가 ${product.keywords.length}개입니다 — 온채널은 5개 이상을 받습니다.`);
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다.');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 온채널 엑셀로 넣지 않습니다(옵션마다 공급가를 사람이 정해야 합니다).');
    }
    if (problems.length) return { rows: [], problems, warnings };

    warnings.push('올린 뒤 온채널에서 승인 요청을 해야 합니다. 등록만 하고 두면 익일 23:59 에 지워집니다.');
    const child = noticeKind(product.noticeCategory) === 'child';
    const certification = product.certificationNumbers[0] ?? null;
    const keywords = product.keywords.slice(0, 10);

    const row: MallSheetRow = {
      분류: mall.categoryCode!,
      상품명: [mall.name.trim(), `(${pack}개)`, keywords[0] ?? ''].filter(Boolean).join(' '),
      // 폼 등록과 같은 모양. 옵션 없는 상품도 온채널은 옵션 한 줄을 받는다.
      옵션명: `${mall.name.replace(/\s+/g, '')}(${pack}개)`,
      온채널공급가: Math.round(supplyPrice),
      '과면세 구분': TAX[product.taxType as keyof typeof TAX] ?? TAX.taxable,
      '미성년자 판매 금지 여부': 'N',
      택배사: Number(fixed.courier) || 0,
      배송비: Number(fixed.shipFee) || 0,
      '배송마감/발송처/발송일': fixed.sendInfo,
      제주도배송비: Number(fixed.jejuFee) || 0,
      도서산간배송비: Number(fixed.islandFee) || 0,
      '수량별 배송비 적용 여부': fixed.qtyShip.toUpperCase() === 'Y' ? 'Y' : 'N',
      '수량별 배송비 기준 수량': Number(fixed.qtyShipBase) || 1,
      반품안내: fixed.returnGuide,
      '공급업체 분류': Number(fixed.supplierType) || 1,
      판매가준수여부: Number(fixed.priceRule) || 1,
      // 가격준수(3)일 때만 적는다. 공급가의 1.4배 이상이어야 한다.
      최종준수가: fixed.priceRule === '3' ? Math.max(Math.ceil((supplyPrice * 1.4) / 10) * 10, mall.salePrice) : null,
      '제목(키워드)': keywords.join('/'),
      상세페이지: mall.detailHtml,
      '메인이미지(600x600)': product.imageUrls[0]!,
      상품고시구분: child ? NOTICE_CHILD : NOTICE_ETC,
      'KC 인증번호': certification ?? '해당사항없음',
      'KC 인증기관': certification ? fixed.kcAgency : '해당사항없음',
      'KC 인증상호': certification ? fixed.kcName : '해당사항없음',
      'KC 인증유형': certification ? Number(fixed.kcType) || 0 : 0,
      '품명/모델명': product.modelName?.trim() || mall.name,
      '제조국 또는 원산지': originCountryName(product.originCountry) ?? '중국',
      '제조사(생산자)/소재지/수입자': fixed.maker,
      '주문후 예상 배송기간': fixed.deliverDays,
      제조년월일: fixed.makeYmd,
      'A/S 책임자 또는 상담 전화번호': fixed.asPhone,
      품질보증기준: '상세페이지참조',
      '크기/무게(중량)/용량': fixed.sizeWeight,
      '동일모델의 출시년월': '상세페이지참조',
      색상: fixed.color,
      '제품 주요 소재(재질)': fixed.material?.trim() || null,
      사용연령: '상세페이지참조',
    };
    return { rows: [row], problems, warnings };
  },
};
