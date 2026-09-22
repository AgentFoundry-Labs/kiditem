import {
  categorySegments,
  detailImageUrls,
  hasDetail,
  isPublicImageUrl,
  isSingleOption,
  mallCommonOptionNormalPrice,
  originCountryName,
  type MallBulkSheetSpec,
  type MallSheetRow,
} from './mall-bulk-sheet';

/**
 * 꼬망세몰(에듀프레 입점사) 상품 대량등록 — `배송상품샘플`(입점사 관리자 › 상품 대량등록, 사장님이 2026-09-20 받음).
 *
 * 첫 줄이 칸 제목이고 둘째 줄부터 상품이다. 상품코드를 비우면 새 상품으로 등록된다. 분류는 번호가 아니라
 * 이름 3단(1차 · 2차 · 3차)이고 — 등록 폼도 3단을 다 고른 때만 붙는다 — 사진은 **외부 주소만** 받는다.
 * 양식에 옵션 칸이 없어 옵션 있는 상품은 몰 화면에서 등록해야 한다.
 */
export const kkomangseSheet: MallBulkSheetSpec = {
  sheetKey: 'kkomangse',
  label: '꼬망세',
  mallKeys: ['kkomangse'],
  categoryBy: 'name',
  template: {
    file: 'kkomangse-delivery-product-sample.xlsx',
    sheet: '배송상품샘플 - 2026-09-20-135209',
    headerRow: 1,
    firstDataRow: 2,
    bookType: 'xlsx',
  },
  maxProducts: 300,
  fixedFields: [
    { key: 'stock', label: '재고량', required: true, defaultValue: '999' },
    {
      key: 'delivery',
      label: '배송처리',
      required: true,
      defaultValue: '기본',
      help: '기본 · 상품별배송 · 개별배송 · 무료배송',
    },
    { key: 'deliveryInfo', label: '배송정보', required: false, defaultValue: '' },
  ],
  notes: [
    '꼬망세 입점사 관리자 › 상품 대량등록에 올립니다. 상품코드 칸이 비어 있으면 새 상품으로 등록됩니다.',
    '사진은 외부 주소만 받습니다 — 우리 저장소 사진은 [사진 올리기]로 공개 주소를 먼저 만드세요.',
    '이 양식에는 옵션 칸이 없습니다. 옵션 있는 상품은 몰 화면에서 등록하세요.',
    '분류는 이름 3단(1차 · 2차 · 3차)을 다 채워야 합니다 — 꼬망세 분류표(607개)에 있는 이름이어야 합니다.',
  ],
  rows(product, context) {
    const problems: string[] = [];
    const warnings: string[] = [];
    const mall = product.malls.kkomangse;
    if (!mall) return { rows: [], problems: ['꼬망세 값이 없습니다.'], warnings };

    const segments = categorySegments(mall.categoryPath);
    if (segments.length < 3) {
      problems.push('꼬망세 분류 3단(1차 · 2차 · 3차)이 필요합니다 — 몰별 값에 `대분류 > 중분류 > 소분류` 로 넣어 주세요.');
    } else if (!context.categories.code('kkomangse', segments.slice(0, 3).join('>'))) {
      // 꼬망세 분류표(입점사 관리자에서 읽어 온 것)에 없는 이름은 몰이 그 줄을 거절한다.
      problems.push(`꼬망세에 없는 분류입니다: ${segments.slice(0, 3).join(' > ')}`);
    }
    if (segments.length > 3) warnings.push(`분류가 ${segments.length}단입니다. 앞 3단만 넣습니다.`);
    if (mall.salePrice <= 0) problems.push('판매가가 0원입니다.');
    if (!product.imageUrls.length) problems.push('인터넷에서 열리는 사진 주소가 없습니다(꼬망세는 사진 주소만 받습니다).');
    if (product.imageSource === 'sabangnet') warnings.push('사진이 사방넷 서버 주소입니다. 사방넷을 끊으면 몰에서 사진이 안 보일 수 있습니다.');
    if (!hasDetail(mall.detailHtml)) problems.push('상세설명이 비어 있습니다.');
    if (!isSingleOption(product)) {
      problems.push('꼬망세 대량등록 양식에는 옵션 칸이 없습니다. 옵션 있는 상품은 몰 화면에서 등록하세요.');
    }
    if (problems.length) return { rows: [], problems, warnings };

    const certification = product.certificationNumbers[0] ?? null;
    const detailImages = detailImageUrls(mall.detailHtml).filter(isPublicImageUrl).slice(0, 5);
    const row: MallSheetRow = {
      '상품코드 (신규등록시 생략)': null,
      대표상품명: mall.name,
      '해시태그 (쉼표로 구분)': product.keywords.join(',') || null,
      '1차 분류': segments[0]!,
      '2차 분류': segments[1]!,
      '3차 분류': segments[2]!,
      정상가: Math.max(mallCommonOptionNormalPrice(product, mall) ?? product.tagPrice ?? 0, mall.salePrice),
      '납품가 (입력시 판매가 자동계산)': null,
      '판매가 (납품가 입력시 생략가능)': mall.salePrice,
      '재고관리(수동, 자동)': '수동',
      재고량: Number(context.fixed.stock) || 0,
      '인쇄문구 사용(사용, 미사용)': '미사용',
      '1회 최소 구매개수': 1,
      '1회 최대 구매개수': 0,
      '중복구매 가능여부(가능, 불가능)': '가능',
      'KC인증(인증, 미인증)': certification ? '인증' : '미인증',
      KC인증번호: certification,
      브랜드: product.brand,
      업체관리용코드: product.code,
      제조사: product.manufacturer,
      원산지: originCountryName(product.originCountry),
      '과세여부(과세, 면세)': product.taxType === 'tax_free' ? '면세' : '과세',
      '배송처리 (기본, 상품별배송, 개별배송, 무료배송)': context.fixed.delivery,
      배송정보: context.fixed.deliveryInfo?.trim() || null,
      '관련상품 적용방식 (사용안함, 자동지정, 수동지정)': '사용안함',
      '목록 기본이미지 (외부URL만)': product.imageUrls[0]!,
      '목록 오버이미지 (외부URL만)': product.imageUrls[1] ?? null,
      '상세이미지1 (외부URL만)': detailImages[0] ?? null,
      '상세이미지2 (외부URL만)': detailImages[1] ?? null,
      '상세이미지3 (외부URL만)': detailImages[2] ?? null,
      '상세이미지4 (외부URL만)': detailImages[3] ?? null,
      '상세이미지5 (외부URL만)': detailImages[4] ?? null,
      // 양식이 엔터를 받지 않는다. 상세설명 HTML 의 줄바꿈만 빈칸으로 바꾼다.
      '상품설명 (엔터제외)': mall.detailHtml!.replace(/\r?\n/g, ' '),
    };
    return { rows: [row], problems, warnings };
  },
};
