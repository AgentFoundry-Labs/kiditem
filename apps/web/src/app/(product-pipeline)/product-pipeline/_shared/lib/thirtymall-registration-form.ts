import { type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 떠리몰(샵바이 파트너어드민, `partner.shopby.co.kr`) 상품등록.
 *
 * 실측 2026-09-11. 등록물 479개(2024-07 ~ 2025-11) 목록과 그중 셋의 수정 화면
 * (`132154869` 야광 안테나 지시봉 · `132154733` 우파루팡 반짝 슈가 말랑이 ·
 * `132022199` 샤이닝 반짝이 풀펜)을 읽고 신규 등록 화면(`/product/add`)과 대조했다.
 * 상세는 `docs/superpowers/2026-09-11-thirtymall-product-register-research.md`.
 *
 * 다른 몰과 다른 것 넷:
 *
 *  1. **폼이 다른 도메인 iframe 안의 React 앱이다**(`partner-remote.shopby.co.kr`).
 *     칸에 `name` 이 없어 표의 줄 제목(`th`)이 유일한 손잡이다. 그래서 값도 줄 제목으로 적는다.
 *  2. **가격은 판매가 − 즉시할인(금액)이다.** 등록물 479개가 전부 할인이 걸려 있다.
 *     판매가 = 정상가, 즉시할인 = 정상가 − 우리 판매가로 넣어 즉시할인가가 우리 판매가가
 *     되게 한다. 공급가는 화면이 수수료 15% 로 계산한다(실측 8,000 − 2,940 → 5,060 · 공급가 4,301).
 *  3. **분류·담당자·브랜드는 검색해서 목록에서 고른다.** 고르는 글자는 목록에 뜨는 그대로다
 *     (분류는 `>` 로 이은 전체 경로).
 *  4. **상품정보제공고시는 `등록` 을 누르면 새 창이 뜬다.** 확장은 그 창까지 가지 않는다 —
 *     사람이 등록물과 같은 값을 넣는다.
 */

export const THIRTYMALL_REGISTER_URL = 'https://partner.shopby.co.kr/product/add';

/** 상품명 꼬리. 등록물 479개 중 477개가 이걸로 끝난다. 배송 템플릿 '배송비무료'와 짝이다. */
export const THIRTYMALL_NAME_SUFFIX = '(업체별도 무료배송)';

/** 상품명 칸 상한(화면 `0/255`). */
export const THIRTYMALL_NAME_MAX = 255;

/** 검색어 칸: 30개 · 500자까지(화면 안내). */
export const THIRTYMALL_KEYWORD_MAX_COUNT = 30;
export const THIRTYMALL_KEYWORD_MAX_LENGTH = 500;

/** 추가이미지 장수. 초안이 아홉 장까지 준다(등록물은 두 장이었다). */
export const THIRTYMALL_MAX_ADDITIONAL_IMAGES = 9;

/**
 * 배송 템플릿. 등록물 479개가 전부 이것이다. 번호(`699221`)는 계정마다 달라서 보이는
 * 글자로 고른다.
 */
export const THIRTYMALL_DELIVERY_TEMPLATE = '기본 - 배송비무료';

/**
 * 표준분류 기본값 — 최근 등록물이 쓴 자리(`1101860`).
 *
 * ⚠️ 옛 등록물 396개는 `패션의류>여성의류>니트/스웨터`(`1010001`)에 들어가 있다. 완구와
 * 맞지 않는 자리라 따르지 않는다.
 */
export const THIRTYMALL_DEFAULT_STANDARD_CATEGORY =
  '생활/건강>문구/사무용품>이벤트/파티용품>데코용품';

/** 전시분류 기본값 — 등록물에서 가장 많은 자리(199개). */
export const THIRTYMALL_DEFAULT_DISPLAY_CATEGORY = '생활/주방>유아동/취미/완구>완구용품';

/** 담당자(몰 MD). 등록물 479개 중 460개가 이 담당자다. 검색 목록에 뜨는 글자 그대로다. */
export const THIRTYMALL_DEFAULT_MANAGER = '노영우(nogoon92)';

/** 브랜드. 최근 등록물이 전부 이 브랜드다. */
export const THIRTYMALL_BRAND = 'kiditem';

/** 판매수수료(파트너 수수료). 화면이 이 값으로 공급가를 계산한다 — 우리는 미리보기에만 쓴다. */
export const THIRTYMALL_COMMISSION_RATE = 0.15;

/** 등록물 세 개의 상품정보제공고시(셋 다 같다). 새 창이라 사람이 넣는다. */
export const THIRTYMALL_NOTICE_HINT =
  '"기타 재화" — 품명 및 모델명·인증사항·A/S 는 "상세설명참조", 제조국 "중국", 제조자 "KY I&D"';

export interface ThirtymallRegistrationOptions {
  /** 묶음 수량. 2 이상이면 상품명에 `(N개)` 가 붙는다. */
  quantity?: number;
  /** 판매가(정상가). 없으면 초안의 정상가, 그다음 원본명 앞의 숫자를 쓴다. */
  listPrice?: number;
  /** 표준분류 전체 경로(`>` 로 이음). */
  standardCategory?: string;
  /** 전시분류 전체 경로(`>` 로 이음). */
  displayCategory?: string;
  /** 담당자 — 검색 목록에 뜨는 글자 그대로. */
  manager?: string;
}

/** 검색칸에 넣고 뜨는 목록에서 고르는 칸. */
export interface ThirtymallPick {
  /** 줄 제목. */
  row: string;
  /** 검색칸에 넣을 글자. */
  query: string;
  /** 목록에서 고를 글자(목록에 뜨는 그대로). */
  pick: string;
}

export interface ThirtymallRegistrationForm {
  url: string;
  /** 줄 제목 → 그 줄 첫 글자칸에 넣을 값. */
  tableFields: Record<string, string>;
  /** 줄 제목 → 누를 라디오 값. */
  tableRadios: Record<string, string>;
  /** 줄 제목 → 목록(select)에서 고를 보이는 글자. */
  tableSelects: Record<string, string>;
  /** 검색해서 고르는 칸들. 순서대로 한다 — 분류를 고르면 다른 칸이 다시 그려질 수 있다. */
  tablePicks: ThirtymallPick[];
  /** 이미지 칸: 대표 · 추가(`이미지 추가` 로 늘림) · 리스트. */
  imageGroups: { main: string[]; additional: string[]; list: string[] };
  /** 상세설명 이미지. 확장이 편집기(Summernote) 그림 버튼으로 몰에 올린다. */
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * 떠리몰 상품명.
 *
 * 등록물 모양: `야광 안테나 지시봉 (24개) (업체별도 무료배송)`. 앞의 소비자가를 떼고,
 * 묶음이면 `(N개)`, 끝에 배송 꼬리를 붙인다. 낱개 등록물(226개)은 수량 표기가 없다.
 * 키워드는 이름에 넣지 않는다 — 등록물은 검색어 칸에 따로 넣었다.
 */
export function buildThirtymallProductName(name: string, quantity: number): string {
  const base = name.trim().replace(/^\d+\s*/, '') || name.trim();
  const tail = [quantity > 1 ? `(${quantity}개)` : '', THIRTYMALL_NAME_SUFFIX]
    .filter(Boolean)
    .join(' ');
  // 꼬리가 잘리면 배송 조건이 사라진다. 넘치면 앞 이름을 줄인다.
  const room = Math.max(THIRTYMALL_NAME_MAX - tail.length - 1, 0);
  return `${base.slice(0, room).trim()} ${tail}`.replace(/\s+/g, ' ').trim();
}

/**
 * 검색어. 등록물처럼 `, ` 로 잇고 30개 · 500자를 넘기지 않는다.
 *
 * 낱말 안의 쉼표는 구분자와 섞이므로 빈칸으로 바꾼다. 넘치면 뒤의 낱말을 통째로 뺀다 —
 * 중간을 자르면 반쪽 낱말이 검색어로 남는다.
 */
export function buildThirtymallKeywords(keywords: readonly string[]): string {
  const out: string[] = [];
  let length = 0;
  for (const raw of keywords) {
    const word = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!word || out.includes(word)) continue;
    if (out.length >= THIRTYMALL_KEYWORD_MAX_COUNT) break;
    const next = length + (out.length > 0 ? 2 : 0) + word.length;
    if (next > THIRTYMALL_KEYWORD_MAX_LENGTH) break;
    out.push(word);
    length = next;
  }
  return out.join(', ');
}

/**
 * 판매가(정상가). 초안의 정상가가 판매가보다 높으면 그걸, 아니면 원본명 앞의 소비자가
 * (`4000과일바구니…`)를, 둘 다 아니면 판매가를 쓴다.
 */
export function thirtymallListPrice(draft: MallProductDraft, salePrice: number): number {
  const fromDraft = draft.variants[0]?.listPrice ?? 0;
  if (fromDraft > salePrice) return fromDraft;
  const matched = /^(\d+)/.exec(draft.displayName.trim());
  const fromName = matched ? Number(matched[1]) : 0;
  return fromName > salePrice ? fromName : salePrice;
}

/**
 * 공급가(미리보기용). 화면과 같은 식이다: `즉시할인가 − round(즉시할인가 × 수수료율)`.
 * 실측 5,060 → 4,301 · 등록물 16,860 → 14,331.
 */
export function thirtymallSupplyPrice(
  finalPrice: number,
  rate: number = THIRTYMALL_COMMISSION_RATE,
): number {
  if (finalPrice <= 0) return 0;
  return finalPrice - Math.round(finalPrice * rate);
}

/** 분류 경로의 끝 이름. 검색칸에는 이것만 넣는다. */
function lastSegment(path: string): string {
  const parts = path.split('>').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? path.trim();
}

export function thirtymallFormFromDraft(
  draft: MallProductDraft,
  options: ThirtymallRegistrationOptions = {},
): ThirtymallRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const salePrice = draft.variants[0]?.salePrice ?? 0;
  const listPrice = options.listPrice && options.listPrice > salePrice
    ? Math.round(options.listPrice)
    : thirtymallListPrice(draft, salePrice);
  const discount = Math.max(listPrice - salePrice, 0);
  const standardCategory = options.standardCategory?.trim() || THIRTYMALL_DEFAULT_STANDARD_CATEGORY;
  const displayCategory = options.displayCategory?.trim() || THIRTYMALL_DEFAULT_DISPLAY_CATEGORY;
  const manager = options.manager?.trim() || THIRTYMALL_DEFAULT_MANAGER;

  const tableFields: Record<string, string> = {
    상품명: buildThirtymallProductName(draft.displayName, quantity),
    판매가: String(listPrice),
    재고수량: String(draft.variants[0]?.stock ?? 0),
  };
  // 할인이 없으면 칸을 건드리지 않는다(기본값 0).
  if (discount > 0) tableFields.즉시할인 = String(discount);
  const keywords = buildThirtymallKeywords(draft.keywords);
  if (keywords) tableFields.검색어 = keywords;

  const rep = draft.representativeImageUrl.trim();
  const extras = draft.additionalImageUrls.map((url) => url.trim()).filter(Boolean);
  const priceLine = discount > 0
    ? `판매가 ${listPrice.toLocaleString('ko-KR')}원 − 즉시할인 ${discount.toLocaleString('ko-KR')}원 = ${salePrice.toLocaleString('ko-KR')}원으로 넣었습니다.`
    : `판매가 ${salePrice.toLocaleString('ko-KR')}원으로 넣었습니다(할인 없음).`;

  return {
    url: THIRTYMALL_REGISTER_URL,
    tableFields,
    tableRadios: {
      '옵션 사용 여부': 'N',
      // 등록물 셋 다 '상세페이지 별도 표기'다.
      인증정보: 'DETAIL_PAGE',
      // 등록물 셋 다 '사용함' + 기타 재화다. 내용은 새 창이라 사람이 넣는다.
      상품정보제공고시: 'USED',
    },
    tableSelects: { '배송 템플릿': THIRTYMALL_DELIVERY_TEMPLATE },
    tablePicks: [
      // 검색은 이름으로 한다. 목록에는 `이름(아이디)` 로 뜬다.
      { row: '담당자', query: manager.replace(/\(.*$/, '').trim() || manager, pick: manager },
      { row: '표준카테고리', query: lastSegment(standardCategory), pick: standardCategory },
      { row: '전시카테고리', query: lastSegment(displayCategory), pick: displayCategory },
      { row: '브랜드', query: THIRTYMALL_BRAND, pick: THIRTYMALL_BRAND },
    ],
    imageGroups: {
      main: rep ? [rep] : [],
      additional: extras.slice(0, THIRTYMALL_MAX_ADDITIONAL_IMAGES),
      // 등록물은 리스트 이미지에도 대표(썸네일01)를 썼다.
      list: rep ? [rep] : [],
    },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps: [
      `상품정보제공고시 [등록] 을 누르면 새 창이 뜹니다. ${THIRTYMALL_NOTICE_HINT} 로 넣습니다(등록물 셋이 모두 이 값).`,
      `${priceLine} 공급가는 화면이 수수료로 계산합니다.`,
      '담당자·표준분류·전시분류·브랜드가 목록에서 골라졌는지 봅니다.',
      '내용을 확인한 뒤 사람이 직접 저장합니다(임시저장도 누르지 않았습니다).',
    ],
  };
}
