import {
  hasDetail,
  isSingleOption,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetCell,
  type MallSheetProduct,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 아이스크림몰 · 하이스토어 상품 일괄등록 — `XLSuploadForm.xlsx`(입점사 관리자, 사장님이 2026-09-20 받음).
 *
 * 2행이 칸 이름, 3행이 수식이 걸린 샘플 행이다. 샘플 행을 지우고 3행부터 쓴다 — 수식 칸(표준카테고리명 · 고시항목명칭
 * 같은 것)은 양식이 사람 대신 채워 주던 값이라, 우리가 같은 규칙으로 계산해 값으로 넣는다.
 *
 * 양식에 사진 칸이 없다. 엑셀은 상품만 만들고 사진은 등록 뒤 몰 화면에서 올려야 한다(상세설명 안의 사진은 들어간다).
 */

/** 고시 항목 이름 → 값. 양식이 분류마다 다른 항목 이름을 주므로 이름으로 가른다. */
function noticeValue(
  label: string,
  product: MallSheetProduct,
  name: string,
  fixed: Readonly<Record<string, string>>,
): string {
  const text = label.replace(/\s+/g, '');
  if (text.includes('품명') || text.includes('모델명')) return name;
  if (text.includes('인증') || text.includes('허가')) return product.certificationNumbers[0] ?? '상세설명참조';
  if (text.includes('제조국') || text.includes('원산지')) return originCountryName(product.originCountry) ?? '상세설명참조';
  if (text.includes('제조자')) return product.manufacturer?.trim() || '상세설명참조';
  if (text.includes('A/S') || text.includes('전화번호')) return fixed.asPhone;
  if (text.includes('품질보증')) return '관련 법 및 소비자 분쟁 해결 기준을 따름';
  return '상세설명참조';
}

/** 양식의 `업체가A` 수식 그대로 — 마진율 구간별로 판매가를 깎고 10원 단위로 반올림한다. */
function partnerPriceA(salePrice: number, margin: number): number {
  const rate = margin < 25 ? 1 : margin < 30 ? 0.9 : margin < 40 ? 0.8 : margin < 50 ? 0.75 : margin < 60 ? 0.7 : 0.65;
  return Math.round((salePrice * rate) / 10) * 10;
}

/** 양식의 `업체가B` 수식 그대로. */
function partnerPriceB(salePrice: number, margin: number): number {
  const rate = margin < 25 ? 1 : margin < 30 ? 0.95 : margin < 40 ? 0.9 : 0.85;
  return Math.round((salePrice * rate) / 10) * 10;
}

export const icecreamSheet: MallBulkSheetSpec = {
  sheetKey: 'icecream-mall',
  label: '아이스크림몰',
  mallKeys: ['icecream-mall'],
  categoryBy: 'code',
  template: {
    file: 'icecream-XLSuploadForm.xlsx',
    sheet: '상품 업로드양식',
    headerRow: 2,
    firstDataRow: 3,
    bookType: 'xlsx',
  },
  maxProducts: 500,
  fixedFields: [
    { key: 'vendorName', label: '입점사명', required: true, defaultValue: '주식회사 거영I&D', help: '양식의 `참조_협력사` 시트 이름 그대로' },
    { key: 'vendorNo', label: '입점사 번호', required: true, defaultValue: '1482' },
    { key: 'purchaseType', label: '매입형태코드', required: true, defaultValue: '20', help: '10 PB · 20 입점사 · 40 중계' },
    { key: 'deliveryType', label: '배송처리유형코드', required: true, defaultValue: '20', help: '10 센터배송 · 20 업체배송' },
    { key: 'supplyRate', label: '공급원가 비율(%)', required: true, defaultValue: '75', help: '공급원가 = 판매가 × 이 비율(마진율 25%)' },
    { key: 'feeMode', label: '카테고리 수수료율 적용', required: true, defaultValue: 'N', help: 'N 우리 공급원가 · Y 분류표의 마진율' },
    { key: 'saleStart', label: '판매시작일자', required: true, defaultValue: '20260101', help: 'yyyymmdd. 지난 날짜면 올리는 즉시 판매' },
    { key: 'saleEnd', label: '판매종료일자', required: true, defaultValue: '20501231' },
    { key: 'shipDays', label: '배송기일', required: true, defaultValue: '2', help: '0 오늘발송 · 1~7 · 10 · 14 · 15' },
    { key: 'safetyType', label: '안전인증구분', required: true, defaultValue: '05', help: '03 안전인증 · 04 안전확인 · 05 공급자적합성확인 · 17 KC인증정보' },
    { key: 'safetyAgency', label: '안전인증기관명', required: false, defaultValue: '' },
    { key: 'supplierNo', label: '매입처번호', required: false, defaultValue: '', help: '비우면 몰이 기본 매입처로 넣습니다.' },
    { key: 'makerNo', label: '제조사 번호', required: false, defaultValue: '' },
    { key: 'asPhone', label: 'A/S 전화번호', required: true, defaultValue: '031-908-5401' },
  ],
  notes: [
    '아이스크림몰 입점사 관리자 › 상품관리 › 상품 일괄등록에 올립니다. 양식의 참조 시트(분류 · 코드 · 브랜드)는 그대로 둡니다.',
    '⚠️ 이 양식에는 사진 칸이 없습니다. 엑셀은 상품만 만들고, 대표 · 추가 사진은 등록 뒤 몰 화면에서 올려야 합니다.',
    '분류는 아이스크림몰 표준카테고리 번호(`BC…`)입니다. 분류 이름이 번호 여러 개를 가리키면 번호를 직접 넣어야 합니다.',
    '고시 항목 · 안전인증 대상 여부는 분류표가 정합니다 — 분류를 고르면 그 분류의 고시 항목 이름이 자동으로 들어갑니다.',
    '공급원가 · 마진율 · 업체가A/B 는 양식 수식과 같은 규칙으로 계산해 값으로 넣습니다(첫 등록에서 금액을 꼭 확인하세요).',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const fixed = context.fixed;
    const mall = product.malls['icecream-mall'];
    if (!mall) return { rows: [], problems: ['아이스크림몰 값이 없습니다.'], warnings };

    const path = mall.categoryPath;
    const ambiguous = path ? context.categories.icecreamAmbiguous(path) : [];
    if (!mall.categoryCode && ambiguous.length) {
      problems.push(`분류 이름 '${path}' 이 번호 ${ambiguous.length}개를 가리킵니다 — 몰별 값에 번호(${ambiguous.slice(0, 3).join(' · ')} …)를 직접 넣어 주세요.`);
    } else if (!mall.categoryCode) {
      problems.push('아이스크림몰 표준카테고리 번호를 모릅니다 — 몰별 값에 분류 이름이나 번호를 넣어 주세요.');
    }
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('옵션 있는 상품은 아직 아이스크림몰 엑셀로 넣지 않습니다(옵션 칸은 라이브 확인 뒤에 엽니다).');
    }

    const category = mall.categoryCode ? context.categories.icecream(mall.categoryCode) : null;
    if (mall.categoryCode && !category) {
      problems.push(`분류 번호 '${mall.categoryCode}' 이 아이스크림몰 표준카테고리표에 없습니다.`);
    }
    const certification = product.certificationNumbers[0] ?? null;
    if (category?.safety && !certification) {
      problems.push('이 분류는 안전인증 대상인데 인증번호를 모릅니다 — 판매상품에 인증번호를 넣어 주세요.');
    }
    if (problems.length) return { rows: [], problems, warnings };

    warnings.push('사진은 엑셀로 올라가지 않습니다. 등록 뒤 몰 화면에서 대표 · 추가 사진을 올려야 판매할 수 있습니다.');
    if (product.imageSource === 'sabangnet') {
      warnings.push('상세설명 사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    }

    const salePrice = mall.salePrice;
    const byCategoryFee = fixed.feeMode.trim().toUpperCase() === 'Y';
    const supplyCost = Math.round((salePrice * (Number(fixed.supplyRate) || 0)) / 100);
    const margin = byCategoryFee
      ? category!.margin ?? 0
      : Math.round(((salePrice - supplyCost) / salePrice) * 100 * 100) / 100;
    const brandNo = product.brand ? context.categories.icecreamBrand(product.brand) : null;
    const notice = context.categories.icecreamNotice(category!.notice);

    const noticeCells: Record<string, MallSheetCell> = {};
    (notice?.items ?? []).slice(0, 14).forEach((label, index) => {
      noticeCells[`고시항목명칭${index + 1}`] = label;
      noticeCells[`고시항목내용${index + 1}`] = noticeValue(label, product, mall.name, fixed);
    });

    const row: MallSheetRow = {
      상품명: mall.name,
      '입점사 번호': fixed.vendorNo,
      입점사명: fixed.vendorName,
      '표준카테고리 번호': mall.categoryCode!,
      표준카테고리명: category!.path,
      '입점사 상품코드': product.code,
      '상품유형 (PR002)': '10',
      상품유형명: '일반상품',
      '판매방식 (PR003)': '10',
      판매방식명: '일반판매',
      '브랜드 번호': brandNo,
      브랜드명: brandNo ? product.brand : null,
      매입처번호: fixed.supplierNo?.trim() || null,
      '제조사 번호': fixed.makerNo?.trim() || null,
      '판매시작일자 (yyyymmdd)': Number(fixed.saleStart) || null,
      '판매종료일자 (yyyymmdd)': Number(fixed.saleEnd) || null,
      '구입자 나이제한 (PR004)': '0',
      전시여부: 'Y',
      '검색키워드 사용여부': product.keywords.length ? 'Y' : 'N',
      검색키워드: product.keywords.slice(0, 10).join(',') || null,
      '포인트 적립 가능여부': 'Y',
      '선물하기 가능여부': 'Y',
      '사이즈가이드 사용여부': 'N',
      '매입형태코드 (PR006)': fixed.purchaseType,
      매입형태: fixed.purchaseType === '10' ? 'PB' : fixed.purchaseType === '40' ? '중계' : '입점사',
      '과/면세구분 (PR007)': product.taxType === 'tax_free' ? '02' : '01',
      '공급원가 (직접입력)': byCategoryFee ? null : supplyCost,
      '공급원가 (마진율 계산)': byCategoryFee ? Math.trunc(salePrice * (1 - margin / 100)) : null,
      정상가: Math.max(product.tagPrice ?? 0, salePrice),
      판매가: salePrice,
      마진율: margin,
      '카테고리 수수료율 적용 여부': byCategoryFee ? 'Y' : 'N',
      '판매가 동일 적용 여부': 'N',
      업체가A: partnerPriceA(salePrice, margin),
      업체가B: partnerPriceB(salePrice, margin),
      '배송처리유형코드 (PR008)': fixed.deliveryType,
      배송처리유형: fixed.deliveryType === '10' ? '센터배송' : '업체배송',
      '배송상품구분 (PR010)': '01',
      '배송상품구분 상세 (PR051)': '10',
      '배송기일(PR025)': fixed.shipDays,
      '재고 관리여부': 'N',
      '안전재고 알림여부': 'N',
      '구매수량 제한여부': 'N',
      옵션사용여부: 'N',
      상품상세: mall.detailHtml,
      '상품고시 품목코드': category!.notice,
      '상품고시 품목명': notice?.name ?? null,
      ...noticeCells,
      '안전인증 대상여부': category!.safety ? 'Y' : 'N',
      '안전인증구분1 (PR026)': category!.safety ? fixed.safetyType : null,
      안전인증기관명1: category!.safety ? fixed.safetyAgency?.trim() || null : null,
      '안전인증분야1-1': category!.safety ? '어린이제품' : null,
      안전인증번호1: category!.safety ? certification : null,
    };
    return { rows: [row], problems, warnings };
  },
};
