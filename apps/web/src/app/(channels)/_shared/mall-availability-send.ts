import {
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';

/**
 * 몰 품절 송신 호출.
 *
 * 확장이 그 몰에 **끝까지 보낸다.** 사람이 몰마다 들어가 다시 누르지 않는다
 * (사장님 2026-09-18: "내가 버튼 누르면 너가 알아서 몰에 들어가서 품절 처리해야지").
 *
 * 상품등록과 다른 이유: 등록은 승인이 붙고 되돌리기 어렵지만, 품절은 같은 화면에서
 * 같은 값으로 되돌릴 수 있다(매니페스트 `supports.resume`). 되돌릴 수 있는 일이라
 * 끝까지 한다.
 *
 * ⚠️ 그래도 `sent` 는 "보냈다"이지 "반영됐다"가 아니다. 반영은 몰 재조회가 답한다.
 */

/** 목록을 읽고 몰마다 한 번씩 보낸다. 몰 관리자는 느리다. */
const SEND_TIMEOUT_MS = 180_000;

/** 지금 재고 읽기는 윙 상품목록을 뒤에서 열어 한 상품만 읽는다. 429 로 쉬는 시간까지 넉넉히. */
const READ_TIMEOUT_MS = 90_000;

/**
 * 확장에 한 번에 넘기는 상품 수. 없는 몰은 한 번에 넘긴다.
 *
 * 쿠팡 윙은 상품마다 윙을 세 번 부르고(읽기 · 보내기 · 다시 읽기) 쉬어 가며 보낸다. 253개를 한 번에 넘기면 3분 안에
 * 끝나지 않아 웹이 먼저 포기하고, 확장 서비스워커도 한 요청을 5분 넘게 붙잡지 못한다(2026-09-18: 20개쯤 보내고
 * 멈췄다). 나눠 보내고 사이사이 진행을 알린다. 꼬망세도 상품마다 설정 화면을 검색 · 저장 · 다시 검색한다.
 */
const SEND_CHUNK: Partial<Record<string, number>> = { coupang: 10, kakao: 20, kkomangse: 20, 'teacher-mall': 20 };

/**
 * 품절을 보낼 수 있는 몰.
 *
 * 확장 `mall-availability-send.js` 의 `SPECS` 와 같아야 한다. 여기 없는 몰은 화면에
 * 버튼이 서지 않는다 — 눌러도 아무 일이 안 일어나는 버튼을 만들지 않는다.
 */
export const MALL_AVAILABILITY_SEND_MALLS = [
  'kkomangse', 'kidkids', 'onch', 'domeggook', 'coupang', 'kakao', 'always', 'art09', 'lotte-on', 'teacher-mall',
  'icecream-mall', 'kidsnote',
] as const;

export type MallAvailabilitySendMall = typeof MALL_AVAILABILITY_SEND_MALLS[number];

/**
 * 아직 그 몰 관리자를 뚫지 않은 몰. 화면이 이유를 그대로 보여 준다.
 *
 * 사방넷 경유는 길로 세지 않는다 — 사방넷 기능을 흡수하고 그만 쓰는 것이 방침이라
 * (KID-251), 몰마다 그 관리자 화면을 직접 뚫는 것만이 길이다.
 */
export const MALL_AVAILABILITY_PENDING: Readonly<Record<string, string>> = {};

/** 길이 없는 몰에 공통으로 붙는 말. 사방넷을 대안으로 제시하지 않는다. */
export const MALL_AVAILABILITY_NO_ROUTE = '이 몰 관리자의 품절 경로를 아직 뚫지 않았습니다.';

/**
 * 이 몰을 지금 방식으로 보내는 확장만 가진 능력. 옛 확장이 옛 방식으로 몰에 쓰지 않게 막는다 — 1.2.16 전 확장은
 * 꼬망세를 페이지 전체(2,602줄) 재저장으로 보냈고, 재개 때 재고 칸에 "{stock}" 글자를 넣었다.
 */
const SEND_REQUIRES_CAPABILITY: Partial<Record<string, string>> = {
  kkomangse: 'mallAvailabilityKkomangseDirectV1',
  // 1.2.18 전 확장은 아이스크림몰을 "경로가 더 필요합니다", 키즈노트를 "품절 경로를 아는 몰이 아닙니다"로 거절한다 —
  // 새로고침하라고 먼저 말한다.
  'icecream-mall': 'mallAvailabilityIcecreamSaleStateV1',
  kidsnote: 'mallAvailabilityKidsnoteStateV1',
};
// 티쳐몰 · 롯데ON · 아트공구는 옛 확장이 모르는 몰이라 확장이 "품절 경로를 아는 몰이 아닙니다"로 거절한다.

export function canSendMallAvailability(mallKey: string): mallKey is MallAvailabilitySendMall {
  return (MALL_AVAILABILITY_SEND_MALLS as readonly string[]).includes(mallKey);
}

/**
 * 지금 재고를 몰에서 바로 읽을 수 있는 몰. 확장 `READ_MALL_KEYS` 와 같아야 한다.
 *
 * 쿠팡 윙은 품절이어도 판매상태가 판매중(ON_SALE)이라, 가져온 상태만으로는 품절인지 모른다. 등록현황 칸의 창이
 * 열릴 때 윙 지금 재고를 읽어 보여 준다(사장님 2026-09-18: "이거 확인을 해줘봐").
 */
export const MALL_AVAILABILITY_READ_MALLS = [
  'coupang', 'kakao', 'always', 'art09', 'lotte-on', 'kkomangse', 'teacher-mall', 'icecream-mall', 'kidsnote',
] as const;

export function canReadMallAvailability(mallKey: string): boolean {
  return (MALL_AVAILABILITY_READ_MALLS as readonly string[]).includes(mallKey);
}

/**
 * 조회가 바뀐 상태를 늦게 보여 주는 몰. 롯데ON 상품 조회는 보낸 직후 옛 판매상태를 섞어 준다(라이브 2026-09-19:
 * 확장이 다시 읽어 확인한 다음 번 조회가 또 옛 값). 확장이 이미 몰에서 확인했으면 칸은 다시 읽지 않고 그 결과를 쓴다.
 */
const READ_LAGS_AFTER_SEND: ReadonlySet<string> = new Set(['lotte-on']);

export function mallReadLagsAfterSend(mallKey: string): boolean {
  return READ_LAGS_AFTER_SEND.has(mallKey);
}

export interface MallLiveOption {
  optionCode: string;
  /** 재고 수. 올웨이즈처럼 품절 여부만 주는 몰은 판매중일 때 null(모름)이다 — 품절이면 0. */
  stock: number | null;
  /** 로켓그로스 옵션 — 쿠팡 재고라 우리가 바꾸지 않는다. */
  rocket: boolean;
}

interface ReadResponse {
  success?: boolean;
  products?: Array<{ code: string; options: MallLiveOption[] }>;
  error?: string;
}

/** 몰 지금 재고를 읽는다. 읽기만 한다 — 몰에 아무것도 보내지 않는다. */
export async function readMallAvailability(mallKey: string, mallProductCode: string): Promise<MallLiveOption[]> {
  const products = await readMallAvailabilityMany(mallKey, [mallProductCode]);
  const options = products.get(mallProductCode);
  if (!options) throw new Error('이 상품을 몰에서 찾지 못했습니다.');
  return options;
}

/**
 * 여러 상품의 몰 지금 재고를 한 번에 읽는다(등록현황 한 페이지). 몰에서 못 찾은 상품은 결과에 없다.
 * 읽기만 한다.
 */
export async function readMallAvailabilityMany(
  mallKey: string,
  mallProductCodes: readonly string[],
): Promise<Map<string, MallLiveOption[]>> {
  const codes = [...new Set(mallProductCodes.map((code) => code.trim()).filter(Boolean))];
  if (codes.length === 0) return new Map();
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) throw new Error('확장프로그램이 필요합니다.');
  let response: ReadResponse;
  try {
    response = await sendToExtension<ReadResponse>(
      extensionId,
      { action: 'readMallAvailability', mallKey, codes },
      READ_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error('설치된 확장이 아직 지금 재고 읽기를 모릅니다. chrome://extensions 에서 KidItem 확장을 새로고침하세요.');
    }
    throw error;
  }
  if (response?.success !== true) throw new Error(response?.error ?? '지금 재고를 읽지 못했습니다.');
  return new Map((response.products ?? []).map((entry) => [entry.code, entry.options]));
}

export interface MallLiveSummary {
  tone: 'sold_out' | 'partial' | 'on_sale' | 'rocket';
  label: string;
}

/**
 * 재고 수가 아니라 품절인지만 주는 몰 — 올웨이즈 [품절], 아트공구 판매안함, 롯데ON 판매상태(품절 · 판매중지),
 * 아이스크림몰 판매상태(품절 · 판매종료), 키즈노트 상태(품절 · 숨김). 품절이면 재고 0 으로 오지만 몰의 재고가 0 인 것은
 * 아니라 '재고 0' 이라고 적지 않는다.
 */
const SOLD_OUT_FLAG_MALLS: ReadonlySet<string> = new Set(['always', 'art09', 'lotte-on', 'icecream-mall', 'kidsnote']);

/** 지금 재고 → 한 줄. 품절은 재고 0 이다(판매상태와 다르다). 로켓그로스 옵션은 쿠팡 재고라 세지 않는다. */
export function summarizeLiveAvailability(options: readonly MallLiveOption[], mallKey?: string): MallLiveSummary {
  const editable = options.filter((option) => !option.rocket);
  if (editable.length === 0) return { tone: 'rocket', label: '로켓그로스 상품 — 쿠팡 재고입니다' };
  const soldOut = editable.filter((option) => option.stock === 0).length;
  if (soldOut === editable.length) {
    if (mallKey && SOLD_OUT_FLAG_MALLS.has(mallKey)) return { tone: 'sold_out', label: '품절' };
    return { tone: 'sold_out', label: editable.length === 1 ? '품절 · 재고 0' : `품절 · 옵션 ${editable.length}개 모두 재고 0` };
  }
  if (soldOut > 0) return { tone: 'partial', label: `옵션 ${editable.length}개 중 ${soldOut}개 품절` };
  const only = editable.length === 1 ? editable[0].stock : null;
  return {
    tone: 'on_sale',
    label: editable.length === 1
      ? only === null ? '판매 가능' : `판매 가능 · 재고 ${only.toLocaleString('ko-KR')}`
      : `판매 가능 · 옵션 ${editable.length}개 재고 있음`,
  };
}

export interface MallAvailabilitySendResult {
  /** 몰에 실제로 보낸 건수. 반영됐다는 뜻은 아니다. */
  sent: number;
  failed: number;
  /** 보낸 것이 관리자 승인 요청인 몰(온채널). 반영은 승인 뒤다. */
  requestOnly: boolean;
  /**
   * 보낸 뒤 몰을 다시 읽어 원하는 상태로 확인된 건수(도매꾹). 다시 읽지 않는 몰은 `null` 이다.
   */
  confirmed: number | null;
  warnings: string[];
  /**
   * 상품 하나를 몰 화면에 띄워 보냈을 때(`show`), 그 화면(쿠팡 윙 상품목록)에 바뀐 재고가 보였는가. 윙 상품목록은
   * 늦게 따라온다 — false 면 재고는 바뀌었고 화면만 아직이다. 띄우지 않았으면 없다.
   */
  listShown?: boolean | null;
}

export interface MallAvailabilityOutcome {
  outcome: 'succeeded' | 'attention' | 'failed';
  reasonCode: 'mall_rechecked' | 'awaiting_mall_approval' | 'awaiting_mall_recheck';
}

/**
 * 보낸 결과를 관찰 기록 한 줄로. 몰을 다시 읽어 **보낸 것이 전부 확인된 것만** 성공이다 — 보냈다는
 * 것만으로는 `attention` 이다(반영은 몰 재조회가 답한다).
 */
export function availabilityOutcome(result: MallAvailabilitySendResult): MallAvailabilityOutcome {
  const reasonCode = result.requestOnly ? 'awaiting_mall_approval' : 'awaiting_mall_recheck';
  if (result.failed > 0) return { outcome: 'failed', reasonCode };
  if (!result.requestOnly && result.confirmed !== null && result.sent > 0 && result.confirmed >= result.sent) {
    return { outcome: 'succeeded', reasonCode: 'mall_rechecked' };
  }
  return { outcome: 'attention', reasonCode };
}

interface SendResponse {
  success?: boolean;
  sent?: number;
  failed?: number;
  requestOnly?: boolean;
  confirmed?: number;
  /** 이미 원하는 재고였던 옵션 수(쿠팡 윙). 문장은 여기서 만든다 — 나눠 보내면 합쳐서 한 줄이어야 한다. */
  already?: number;
  /** 쿠팡 재고라 건너뛴 로켓그로스 옵션 수(쿠팡 윙). */
  rocket?: number;
  /** 몰이 막아 도중에 멈췄다(쿠팡 윙 429). 남은 상품은 보내지 않았다. */
  stopped?: string;
  listShown?: boolean | null;
  warnings?: string[];
  error?: string;
}

interface SendOptions {
  resume?: boolean;
  /** 상품코드 → 그 상품의 품절 옵션코드. 옵션 단위로 보내는 몰(쿠팡 윙)만 쓴다. 없으면 상품 전체다. */
  optionCodes?: Readonly<Record<string, readonly string[]>>;
  /** 나눠 보내는 몰에서 한 묶음이 끝날 때마다. `done` 은 끝낸 상품 수다. */
  onProgress?: (done: number, total: number) => void;
  /**
   * 등록현황 칸에서 상품 하나를 눌렀다. 확장이 그 상품의 몰 화면(쿠팡 윙은 그 상품을 검색한 상품목록)을 앞에 띄워
   * 거기서 보내고, 바뀐 재고를 보여 준 채로 둔다(사장님 2026-09-18: "vendor-inventory/list 여기 가서 해야하잖아").
   */
  show?: boolean;
}

export async function sendMallAvailability(
  mallKey: MallAvailabilitySendMall,
  mallProductCodes: readonly string[],
  options: SendOptions = {},
): Promise<MallAvailabilitySendResult> {
  const codes = [...new Set(mallProductCodes.map((code) => code.trim()).filter(Boolean))];
  if (codes.length === 0) {
    throw new Error('이 몰에는 보낼 상품코드가 없습니다.');
  }

  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 '
      + '해당 몰 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const required = SEND_REQUIRES_CAPABILITY[mallKey];
  if (required) {
    const runtime = await detectOrderCollectionExtensionRuntime(1200, [required]);
    if (runtime.status !== 'ready') {
      throw new Error(
        `설치된 KidItem 확장${runtime.status === 'incompatible' ? `(${runtime.version})` : ''}이 이 몰의 옛 방식입니다. `
        + 'chrome://extensions 에서 확장을 새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 보내세요.',
      );
    }
  }

  const chunkSize = SEND_CHUNK[mallKey] ?? codes.length;
  const optionCount = (list: readonly string[]) =>
    list.reduce((sum, code) => sum + (options.optionCodes?.[code]?.length ?? 1), 0);
  const total = { sent: 0, failed: 0, confirmed: 0, already: 0, rocket: 0, confirmedKnown: true, requestOnly: false };
  let listShown: boolean | null | undefined;
  const warnings: string[] = [];
  for (let start = 0; start < codes.length; start += chunkSize) {
    const chunk = codes.slice(start, start + chunkSize);
    let response: SendResponse;
    try {
      response = await sendChunk(extensionId, mallKey, chunk, options);
    } catch (error) {
      // 앞 묶음은 이미 몰에 갔다. 버리지 않고 멈춘 자리를 말한다.
      if (start === 0) throw error;
      const message = error instanceof Error ? error.message : String(error);
      total.failed += optionCount(codes.slice(start));
      warnings.push(`${codes.length}개 중 ${start}개까지 보내고 멈췄습니다 — ${message}`);
      break;
    }
    total.sent += response.sent ?? 0;
    total.failed += response.failed ?? 0;
    total.already += response.already ?? 0;
    total.rocket += response.rocket ?? 0;
    total.requestOnly ||= response.requestOnly === true;
    if (response.listShown !== undefined) listShown = response.listShown;
    if (typeof response.confirmed === 'number') total.confirmed += response.confirmed;
    else total.confirmedKnown = false;
    warnings.push(...(response.warnings ?? []));
    const done = Math.min(start + chunk.length, codes.length);
    options.onProgress?.(done, codes.length);
    if (response.stopped) {
      // 몰이 막았다. 더 보내면 더 막힌다 — 남은 상품은 보내지 않은 채로 둔다.
      total.failed += optionCount(codes.slice(done));
      break;
    }
  }

  const summary: string[] = [];
  if (total.already > 0) {
    summary.push(`${total.already}개 옵션은 이미 ${options.resume ? '재고가 있었습니다' : '재고 0이었습니다'}.`);
  }
  if (total.rocket > 0) summary.push(`로켓그로스 옵션 ${total.rocket}개는 쿠팡 재고라 건너뛰었습니다.`);

  return {
    sent: total.sent,
    failed: total.failed,
    requestOnly: total.requestOnly,
    confirmed: total.confirmedKnown ? total.confirmed : null,
    warnings: [...summary, ...new Set(warnings)],
    ...(listShown !== undefined ? { listShown } : {}),
  };
}

async function sendChunk(
  extensionId: string,
  mallKey: MallAvailabilitySendMall,
  codes: readonly string[],
  options: SendOptions,
): Promise<SendResponse> {
  const optionCodes = options.optionCodes
    ? Object.fromEntries(codes.flatMap((code) => (options.optionCodes?.[code] ? [[code, options.optionCodes[code]]] : [])))
    : null;
  let response: SendResponse;
  try {
    response = await sendToExtension<SendResponse>(
      extensionId,
      {
        action: 'sendMallAvailability',
        mallKey,
        codes,
        resume: options.resume === true,
        ...(optionCodes ? { options: optionCodes } : {}),
        ...(options.show ? { show: true } : {}),
      },
      SEND_TIMEOUT_MS,
    );
  } catch (error) {
    // 확장이 이 액션을 모르면 아무도 응답하지 않고 포트가 닫힌다. Chrome 원문은 원인을
    // 알려주지 않으므로 실제 원인으로 바꿔 말한다.
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error(
        '설치된 확장이 아직 품절 송신을 모릅니다. chrome://extensions 에서 KidItem 확장을 '
        + '새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 시도하세요.',
      );
    }
    throw error;
  }

  if (response?.success !== true) {
    throw new Error(response?.error ?? '품절을 보내지 못했습니다.');
  }
  return response;
}
