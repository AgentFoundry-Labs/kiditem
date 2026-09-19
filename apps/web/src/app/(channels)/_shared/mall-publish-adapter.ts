import type { MallProductDraft } from '../../(product-pipeline)/product-pipeline/_shared/lib/mall-product-draft';

/**
 * 몰 등록 어댑터.
 *
 * 화면은 몰을 하나도 모른다. "상품 N개를 몰 M개에 보낸다" 만 알고, 몰 하나가
 * 실제로 무엇을 요구하고 어떻게 받는지는 전부 어댑터가 안다. 몰을 늘리는 일은
 * 이 인터페이스를 구현한 파일 하나를 추가하고 레지스트리에 등록하는 것이다 —
 * 화면·상태·버튼을 몰마다 새로 만들던 방식을 여기서 끝낸다.
 *
 * 업계(사방넷·플레이오토·샵플링) 공통 구조를 우리 크기로 줄인 것이다.
 *  - 값은 3층이다: 마스터(상품) / 템플릿(몰 고정값) / 오버라이드(이번 송신)
 *  - 등록 단위는 (상품 × 몰) 이고, 몰마다 한 번에 처리 가능한 개수가 다르다
 *  - "보냈다" 와 "등록됐다" 는 다른 사실이고, 어댑터가 둘을 구분해 보고한다
 */

/**
 * 값의 출처.
 *
 * `master`   상품 자체에서 온다. 몰이 달라도 같다.
 * `template` 이 몰에서 늘 같은 값. 판매자·수수료·배송조건 같은 것.
 * `override` 이번 송신에서만 사람이 고른 값. 몰 카테고리가 대표적이다.
 */
export type MallValueOrigin = 'master' | 'template' | 'override';

export const MALL_VALUE_ORIGIN_LABEL: Record<MallValueOrigin, string> = {
  master: '상품',
  template: '몰 고정',
  override: '이번 송신',
};

/** 어댑터가 몰에 닿는 방식. 화면이 소요 시간과 사람 개입을 이 값으로 안내한다. */
export type MallPublishMode = 'form' | 'excel' | 'api';

/** 화면이 그려야 하는 입력칸 하나. 어댑터가 자기 것을 선언한다. */
export interface MallFieldSpec {
  key: string;
  label: string;
  origin: MallValueOrigin;
  /**
   * `cascade` 는 몰에서 그때그때 목록을 읽어 단계별로 고르는 칸이다. 값은
   * `1단 > 2단 > 3단` 처럼 `>` 로 이어 담는다 — 몰마다 단 수가 달라서 칸을
   * 몇 개 그릴지도 어댑터가 말한다.
   */
  control: 'text' | 'select' | 'cascade';
  defaultValue: string;
  /** `control: 'select'` 일 때의 선택지. */
  options?: readonly { value: string; label: string; hint?: string }[];
  /** `control: 'cascade'` 일 때 목록을 물어볼 몰과 단 수. */
  cascade?: { mall: 'domeggook' | 'onch'; levels: number };
  /** 비어 있으면 이 몰로 보낼 수 없다. */
  required: boolean;
  help?: string;
  /**
   * 여러 몰이 같은 값을 쓰는 칸인가.
   *
   * 안전인증번호처럼 상품에 하나뿐인 값은 몰마다 다시 받을 이유가 없다. 화면이
   * 이런 칸을 위에 한 번만 세우고 그 값을 모든 몰에 넘긴다 — 같은 숫자를 몰 수만큼
   * 다시 치게 하면 서로 다르게 적히고, 그건 우리가 만든 오류다.
   *
   * 같은 `key` 를 쓰는 몰끼리만 공유된다. 뜻이 다른 값에 같은 이름을 붙이지 말 것.
   */
  shared?: boolean;
}

/** 송신 전에 사람이 보는 값 한 줄. */
export interface MallPreviewRow {
  label: string;
  value: string;
  origin: MallValueOrigin;
  /** 이 몰에서만 달라지는 값인가. 화면이 강조한다. */
  mallSpecific: boolean;
}

/** 어댑터에 넘기는 상품 한 건. 목록에서 바로 얻을 수 있는 것만 담는다. */
export interface MallPublishItem {
  /** 수집상품 id, 또는 `source: 'sales_product'` 이면 판매상품 id. */
  candidateId: string;
  name: string;
  salePrice: number | null;
  thumbnailUrl: string | null;
  /** 어디서 온 상품인가. 없으면 수집상품이다(ADR-0013 이전과 같다). */
  source?: 'candidate' | 'sales_product';
  /** 판매상품의 쓰는 단품 수. 둘 이상이면 옵션을 채우는 몰에만 보낸다. */
  optionCount?: number;
}

export interface MallSendInput {
  items: readonly MallPublishItem[];
  values: Readonly<Record<string, string>>;
}

export interface MallSendOutcome {
  ok: boolean;
  /**
   * 몰에 실제로 등록됐음이 확인됐는가.
   *
   * 폼을 채운 것도, 엑셀을 만든 것도 등록이 아니다. 업계에서 가장 자주 나오는
   * 사고가 "큐 상태 = 성공" 으로 읽는 것이라(사방넷 FAQ: 실제 등록 성공 여부와
   * 상관없이 처리완료로 바뀝니다), 여기서 두 사실을 분리해 둔다.
   */
  confirmed: boolean;
  /** 사람이 몰 화면에서 마저 해야 하는 것. */
  manualSteps: string[];
  warnings: string[];
  error?: string;
}

export interface MallPublishAdapter {
  /**
   * 몰 키. **서버 매니페스트·채널 계정과 같은 값이어야 한다**(`art09`,
   * `always`, `teacher-mall` …).
   *
   * 화면은 이 키로 계정을 찾아 불을 켜고 로고를 고른다. 확장에 넘기는 키
   * (`fillMallRegistrationForm('artgonggu', …)`)와는 다른 이름일 수 있다 —
   * 그건 확장 안의 폼 스펙 이름이다. 둘을 섞으면 계정이 있는데도 카드가
   * 빨강으로 남고, 등록현황 표에서 그 몰의 열이 통째로 비어 보인다.
   */
  mallKey: string;
  mallName: string;
  /**
   * 이 어댑터의 등록 한 번에 **함께 올라가는** 다른 몰 키.
   *
   * ESM Plus 는 G마켓 등록 한 번이 옥션까지 올라간다(실측 2026-09-11: 빈 폼의 판매사이트에
   * 둘 다 켜진 채로 열린다). 그런 몰에는 어댑터를 따로 두지 않는다 — 두면 같은 폼을 두 번
   * 열어 같은 상품을 두 번 올린다. 화면은 이 값으로 그 몰도 '상품등록 됨' 으로 본다.
   */
  alsoPublishesTo?: readonly string[];
  mode: MallPublishMode;
  /**
   * 한 작업이 담을 수 있는 상품 수.
   *
   * 폼 자동채움은 화면 하나에 상품 하나라 1 이고, 엑셀은 한 파일에 전부 담긴다.
   * 화면은 이 값만 보고 작업을 쪼갠다.
   */
  batchSize: number;
  /** 마지막 제출을 사람이 눌러야 하는가. 승인제 몰은 항상 true. */
  requiresOperatorSubmit: boolean;
  /**
   * 옵션 여러 개(단품 둘 이상)를 몰 폼 · 파일에 채울 수 있는가. 아니면 옵션 상품은 이 몰로 보내지 않는다 —
   * 옵션 한 줄로 줄여 보내면 몰에서 다른 옵션을 살 길이 없다.
   */
  supportsOptions?: boolean;
  /** 판매상품(ADR-0013)에서 보낼 수 있는가. 쿠팡 윙 엑셀은 아직 수집상품만 받는다. */
  acceptsSalesProducts?: boolean;
  /** 이 몰이 요구하는 값. 화면이 이 선언으로 입력칸을 그린다. */
  fields: readonly MallFieldSpec[];
  /** 송신 없이 값만 보여준다. */
  preview(item: MallPublishItem, values: Readonly<Record<string, string>>): MallPreviewRow[];
  /** 몰 기준으로 이 상품이 부족한 지점. 비어 있어야 보낼 수 있다. */
  validate(item: MallPublishItem, values: Readonly<Record<string, string>>): string[];
  send(input: MallSendInput): Promise<MallSendOutcome>;
}

/** 어댑터 기본값으로 채운 값 묶음. 화면 진입 시 한 번 만든다. */
export function defaultAdapterValues(
  adapter: MallPublishAdapter,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of adapter.fields) values[field.key] = field.defaultValue;
  return values;
}

/**
 * 목록 단계의 판매가 판정.
 *
 * ⚠️ `null` 은 0원이 아니라 **모른다**는 뜻이다. 수집상품 목록에는 가격 컬럼이 없고
 * (라이브 확인 2026-09-10), 실제 판매가는 상세를 열 때 셀피아 이름매칭으로 붙는다.
 * 목록의 null 을 0원으로 읽고 막으면, 상세에서 값이 나올 상품까지 못 보낸다.
 *
 * 진짜 0원은 초안을 만든 뒤 `mallProductDraftGaps` 가 잡는다 — 그때는 해석된 값이라
 * 판정이 정확하다.
 */
/**
 * 상품의 출처 · 옵션 수로 이 몰에 못 보내는 이유. 어댑터마다 다시 적지 않고 계획이 한 번 본다.
 */
export function itemSourceProblem(adapter: MallPublishAdapter, item: MallPublishItem): string | null {
  if (item.source !== 'sales_product') return null;
  if (adapter.acceptsSalesProducts === false) return `${adapter.mallName}는 아직 판매상품에서 보낼 수 없습니다(수집상품만).`;
  if ((item.optionCount ?? 1) > 1 && !adapter.supportsOptions) {
    return `옵션 ${item.optionCount}개 상품입니다. ${adapter.mallName} 옵션 채우기가 아직 없어 보내지 않습니다.`;
  }
  return null;
}

export function listPriceProblem(salePrice: number | null): string | null {
  if (salePrice === null) return null;
  if (salePrice > 0) return null;
  return '판매가가 0원입니다. 등록준비에서 판매가를 먼저 입력하세요.';
}

/** 필수인데 비어 있는 칸. 몰 카드에 그대로 표시한다. */
export function missingRequiredFields(
  adapter: MallPublishAdapter,
  values: Readonly<Record<string, string>>,
): MallFieldSpec[] {
  return adapter.fields.filter(
    (field) => field.required && !(values[field.key] ?? '').trim(),
  );
}

export type { MallProductDraft };
