import {
  CHANNELS_REGISTRATION_OPERATION_CAPABILITY,
  MALL_AVAILABILITY_READ_KIND,
  MALL_AVAILABILITY_READ_MAX_LISTINGS,
  MallAvailabilityReadResultSchema,
  type MallAvailabilityRow,
} from '@kiditem/shared/channels-operations';
import { isOperationTerminal, OperationFinishResponseSchema, type OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { noteOperationLoginFailureForMall, operationLoginOptions } from '@/lib/operation-login';
import { requestOperationStart } from '@/lib/operation-start';
import { attemptFailureText } from '@/lib/operator-error';
import { mallStopBadge, type MallStopKind } from './mall-presentation';
import {
  newRegistrationIdempotencyKey,
  readRegistrationOperation,
  RegistrationOperationInProgress,
  startRegistrationOperation,
  waitForRegistrationOperation,
  type RegistrationOperationRead,
} from './registration-operation';

/**
 * 몰 품절·재개 송신과 지금 재고 읽기(KID-364).
 *
 * 품절·재개는 등록 실행(`channels.registration`, sold_out·resume) 하나 = 몰 계정 하나의 리스팅 묶음이다(옛 일괄 품절과
 * 같다, 2026-09-27 리더 결정). 잠금은 계정 + 리스팅마다라 같은 리스팅으로 두 번 보내지 않는다. 확장 몰 쓰기 모듈이 몰별
 * 화면과 옵션 처리를 맡고, 반영은 몰을 다시 읽은 증거로 서버가 판정한다 — 보냈다는 것은 반영의 증거가 아니다.
 * 지금 재고는 판매 상태 읽기 실행(`channels.mall_availability_read`)이다. 읽기만 하고 원장에 쓰지 않는다.
 */

/**
 * 품절을 보낼 수 있는 몰(확장 몰 쓰기 모듈의 품절 sender가 있는 몰). 여기 없는 몰은 화면에 버튼이 서지 않는다 — 눌러도
 * 아무 일이 안 일어나는 버튼을 만들지 않는다. 설치된 확장이 그 몰을 아는지는 시작할 때 `mallWriteSite.<key>`로 본다.
 */
export const MALL_AVAILABILITY_SEND_MALLS = [
  'kkomangse', 'kidkids', 'onch', 'domeggook', 'coupang', 'kakao', 'always', 'art09', 'lotte-on', 'teacher-mall',
  'icecream-mall', 'kidsnote', 'gmarket', 'auction', '11st', 'smartstore', 'thirtymall',
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

export function canSendMallAvailability(mallKey: string): mallKey is MallAvailabilitySendMall {
  return (MALL_AVAILABILITY_SEND_MALLS as readonly string[]).includes(mallKey);
}

/**
 * 지금 재고를 몰에서 바로 읽을 수 있는 몰(확장 판매 상태 읽기 collector가 읽는 몰).
 *
 * 쿠팡 윙은 품절이어도 판매상태가 판매중(ON_SALE)이라, 가져온 상태만으로는 품절인지 모른다. 등록현황 칸의 창이
 * 열릴 때 윙 지금 재고를 읽어 보여 준다(사장님 2026-09-18: "이거 확인을 해줘봐").
 */
export const MALL_AVAILABILITY_READ_MALLS = [
  'coupang', 'kakao', 'always', 'art09', 'lotte-on', 'kkomangse', 'teacher-mall', 'icecream-mall', 'kidsnote',
  'gmarket', 'auction', '11st', 'smartstore', 'kidkids', 'thirtymall',
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
  /** 못 사는 상태일 때 그 몰의 상태 글자(판매중지 · 품절 · 판매종료 · 숨김 …). 칸이 몰의 말 그대로 적는다. */
  state?: string;
}

export interface MallLiveSummary {
  /**
   * 칸 색(`MALL_STOP_TONE`). 품절 처리로 생기는 것(품절 · 판매중지)은 sold_out, 몰이 막은 것(판매불가 · 판매금지)은 blocked,
   * 아직 판매 전인 것(미승인 · 판매대기)은 pending, 끝났거나 숨긴 것(판매종료 · 숨김)은 ended.
   */
  tone: MallStopKind | 'on_sale' | 'rocket';
  /** 칸 창의 한 줄("지금 …"). */
  label: string;
  /** 칸 알약에 쓰는 짧은 말. 판매 가능 · 로켓그로스는 칸이 알약을 바꾸지 않아 없다. */
  badge?: string;
}

/**
 * 재고 수가 아니라 품절인지만 주는 몰 — 올웨이즈 [품절], 아트공구 판매안함, 롯데ON 판매상태(품절 · 판매중지),
 * 아이스크림몰 판매상태(품절 · 판매종료), 키즈노트 상태(품절 · 숨김). 품절이면 재고 0 으로 오지만 몰의 재고가 0 인 것은
 * 아니라 '재고 0' 이라고 적지 않는다.
 */
const SOLD_OUT_FLAG_MALLS: ReadonlySet<string> = new Set([
  'always', 'art09', 'lotte-on', 'icecream-mall', 'kidsnote', 'gmarket', 'auction', '11st', 'smartstore', 'kidkids',
  'thirtymall',
]);

/** 품절을 판매중지로 보내는 몰(ESM · 11번가 · 스마트스토어 · 떠리몰) — 칸은 '품절' 이 아니라 그 몰의 말 그대로 '판매중지' 라고 적는다. */
const SUSPENSION_MALLS: ReadonlySet<string> = new Set(['gmarket', 'auction', '11st', 'smartstore', 'thirtymall']);

/** 이 몰에서 "품절 처리"가 실제로 하는 일의 이름 — 알림 문장에 쓴다. */
export function mallSoldOutWord(mallKey: string): '판매중지' | '품절' {
  return SUSPENSION_MALLS.has(mallKey) ? '판매중지' : '품절';
}

/** 칸 창에 붙는 한 줄 — 품절을 판매중지로 보내는 몰이면 그렇다고, 판매중지를 오래 두면 지우는 몰이면 그 기간을 말한다. */
export function mallSoldOutNote(mallKey: string): string | null {
  if (mallKey === 'gmarket') return '지마켓은 품절을 판매중지로 보냅니다. 판매중지 13개월 동안 상품정보를 안 고치면 지마켓이 상품을 지웁니다.';
  if (mallKey === 'auction') return '옥션은 품절을 판매중지로 보냅니다. 판매중지 90일 동안 상품정보를 안 고치면 옥션이 상품을 지웁니다.';
  if (SUSPENSION_MALLS.has(mallKey)) return '이 몰은 품절을 판매중지로 보냅니다. 판매 재개는 판매중지를 풉니다.';
  return null;
}

/**
 * 몰이 준 "지금 못 사는" 상태 글자를 칸의 말로 — 칸이 뭐든 '품절' 로 적으면 옥션이 막은 판매불가도 우리가 품절 처리한
 * 것처럼 보인다(사장님 2026-09-19). 갈래와 말은 가져온 상태와 같은 표(`mallStopBadge`)를 쓴다.
 */
function statedSummary(word: string): MallLiveSummary {
  const stop = mallStopBadge(word);
  // 모르는 말은 못 사는 것으로 두되 몰의 말 그대로 적는다.
  if (!stop) return { tone: 'sold_out', label: word, badge: word };
  // 판매 재개는 우리가 멈춘 상태만 푼다 — 몰이 막은 것은 몰에서 까닭을 풀어야 한다.
  if (stop.kind === 'blocked') return { tone: 'blocked', label: `${word} — 몰이 막은 상태라 판매 재개로 풀리지 않습니다`, badge: stop.label };
  if (stop.label !== word) return { tone: stop.kind, label: `${stop.label} · ${word}`, badge: stop.label };
  return { tone: stop.kind, label: word, badge: stop.label };
}

/** 받침에 맞춘 목적격 조사(을 · 를). */
export function withObjectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}를`;
  return `${word}${code % 28 === 0 ? '를' : '을'}`;
}

/** 지금 재고 → 한 줄. 품절은 재고 0 이다(판매상태와 다르다). 로켓그로스 옵션은 쿠팡 재고라 세지 않는다. */
export function summarizeLiveAvailability(options: readonly MallLiveOption[], mallKey?: string): MallLiveSummary {
  const editable = options.filter((option) => !option.rocket);
  if (editable.length === 0) return { tone: 'rocket', label: '로켓그로스 상품 — 쿠팡 재고입니다' };
  const soldOut = editable.filter((option) => option.stock === 0).length;
  if (soldOut === editable.length) {
    // 몰이 준 상태 글자가 있으면 그대로(11번가 품절 · 옥션 판매불가 · 스마트스토어 판매대기처럼 판매중지가 아닌 것도 있다).
    const stated = editable.length === 1 ? editable[0].state?.trim() : undefined;
    if (stated) return statedSummary(stated);
    if (mallKey && SUSPENSION_MALLS.has(mallKey)) return { tone: 'sold_out', label: '판매중지', badge: '판매중지' };
    if (mallKey && SOLD_OUT_FLAG_MALLS.has(mallKey)) return { tone: 'sold_out', label: '품절', badge: '품절' };
    return {
      tone: 'sold_out',
      label: editable.length === 1 ? '품절 · 재고 0' : `품절 · 옵션 ${editable.length}개 모두 재고 0`,
      badge: '품절',
    };
  }
  if (soldOut > 0) return { tone: 'partial', label: `옵션 ${editable.length}개 중 ${soldOut}개 품절`, badge: '일부 품절' };
  const only = editable.length === 1 ? editable[0].stock : null;
  return {
    tone: 'on_sale',
    label: editable.length === 1
      ? only === null ? '판매 가능' : `판매 가능 · 재고 ${only.toLocaleString('ko-KR')}`
      : `판매 가능 · 옵션 ${editable.length}개 재고 있음`,
  };
}

/**
 * The extension uses a stable machine reason when it cannot match the mall's
 * option composition. Keep that reason out of operator-facing toasts while
 * preserving any provider detail after the code.
 */
export function translateMallAvailabilityWarning(warning: string): string {
  if (!/composition_unconfirmed/i.test(warning)) return warning;
  const detail = warning.replace(/composition_unconfirmed/gi, '').replace(/^[\s:：-]+/, '').trim();
  return detail
    ? `상품 구성을 확인하지 못했습니다. ${detail}`
    : '상품 구성을 확인하지 못했습니다. 몰에서 옵션 구성을 확인한 뒤 다시 시도하세요.';
}

// ── 품절 · 재개 ──────────────────────────────────────────────────────────────────

/** 묶음 한 항목: 리스팅 하나(상품 전체) 또는 그 리스팅의 옵션들. 서버 plan이 외부 id·옵션으로 푼다. */
export type MallAvailabilityItem =
  | { channelListingId: string; channelListingOptionIds?: undefined }
  | { channelListingId?: undefined; channelListingOptionIds: string[] };

/** 한 실행이 담는 리스팅 수 상한(계약 scope `items`). 넘으면 화면이 나눠 시작한다. */
export const MALL_AVAILABILITY_BATCH_MAX = MALL_AVAILABILITY_READ_MAX_LISTINGS;

export interface MallAvailabilityRun {
  /** 시작했거나 이미 돌던 실행. */
  operation: RegistrationOperationRead | null;
  /** 이번 호출이 새 실행을 시작했다. */
  started: boolean;
  /** 이미 돌던 실행을 만났을 때의 서버 문장. */
  message: string | null;
}

interface WaitOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * 몰 계정 하나의 품절·재개 묶음을 실행 하나로 보낸다. 같은 계정의 같은 리스팅 실행이 이미 돌면 다시 보내지 않고 그 실행을
 * 돌려준다. 결과는 `reconciling`(몰에서 확인 필요)까지 기다린다.
 */
export async function sendMallAvailability(
  input: {
    mallKey: string;
    channelAccountId: string;
    action: 'sold_out' | 'resume';
    items: readonly MallAvailabilityItem[];
    idempotencyKey?: string;
  },
  options: WaitOptions = {},
): Promise<MallAvailabilityRun> {
  if (input.items.length === 0) throw new Error('이 몰에는 보낼 상품이 없습니다.');
  if (input.items.length > MALL_AVAILABILITY_BATCH_MAX) {
    throw new Error(`한 번에 ${MALL_AVAILABILITY_BATCH_MAX}개까지 보냅니다. 나눠 보내 주세요.`);
  }
  let operationId: string;
  try {
    ({ operationId } = await startRegistrationOperation({
      mallKey: input.mallKey,
      idempotencyKey: input.idempotencyKey ?? newRegistrationIdempotencyKey(input.action),
      scope: {
        executionKind: input.action,
        channelAccountId: input.channelAccountId,
        items: input.items.map((item) => (item.channelListingId
          ? { channelListingId: item.channelListingId }
          : { channelListingOptionIds: [...(item.channelListingOptionIds ?? [])] })),
      },
    }));
  } catch (error) {
    if (!(error instanceof RegistrationOperationInProgress)) throw error;
    const existing = error.existingOperationId ? await readRegistrationOperation(error.existingOperationId) : null;
    return { operation: existing, started: false, message: error.message };
  }
  return { operation: await waitForRegistrationOperation(operationId, options), started: true, message: null };
}

// ── 지금 재고 읽기 ───────────────────────────────────────────────────────────────

/**
 * 읽기 실행 결과를 기다리며 그 실행 하나(`GET /api/operations/:id`)를 3초마다 읽는다.
 *
 * 읽기 폴링 예산(등록현황 한 화면, `use-mall-live-availability`): 페이지가 뜨면 읽을 수 있는 몰 열마다 읽기 실행 하나를
 * 함께 시작한다(옛 훅과 같은 주기 — 페이지당 한 번, 같은 동시 수 — 몰 열 수). 실행마다 끝날 때까지 분당 20번 읽으므로
 * 최악은 읽는 몰 15곳 × 20 = 분당 300회(탭 하나)이고, API 제한 분당 600회 안이다. 끝난 실행은 더 읽지 않는다.
 */
const READ_POLL_MS = 3_000;
/** 확장이 윙 상품목록을 뒤에서 열어 읽는다. 429로 쉬는 시간까지 넉넉히(옛 90초 + 시작). */
const READ_WAIT_LIMIT_MS = 180_000;
const READ_STILL_RUNNING = '지금 재고를 아직 읽는 중입니다. 잠시 뒤 다시 확인해 주세요.';
const READ_FAILED = '지금 재고를 읽지 못했습니다.';

async function waitForAvailabilityRead(operationId: string, options: WaitOptions): Promise<OperationView> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? READ_WAIT_LIMIT_MS);
  for (;;) {
    const { operation } = OperationFinishResponseSchema.parse(
      await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`),
    );
    if (operation.kind !== MALL_AVAILABILITY_READ_KIND) throw new Error(READ_FAILED);
    if (isOperationTerminal(operation.status)) return operation;
    if (now() >= deadline) throw new Error(READ_STILL_RUNNING);
    await sleep(READ_POLL_MS);
  }
}

function liveOption(row: MallAvailabilityRow): MallLiveOption {
  const state = !row.available ? row.observedStatus?.trim() : undefined;
  return {
    optionCode: row.externalOptionId ?? row.externalListingId,
    // 판매중이면 몰이 준 수(모르면 null), 못 사는 상태면 0 — 칸이 품절로 읽는다.
    stock: row.available ? row.stock : 0,
    // 로켓그로스 옵션은 쿠팡 재고다 — 칸이 품절로 세지 않는다.
    rocket: row.rocket,
    ...(state ? { state } : {}),
  };
}

async function readChunk(
  input: { mallKey: string; channelAccountId: string; codes: readonly string[]; automatic: boolean },
  options: WaitOptions,
): Promise<MallAvailabilityRow[]> {
  const outcome = await requestOperationStart(MALL_AVAILABILITY_READ_KIND, {
    channelAccountId: input.channelAccountId,
    mallKey: input.mallKey,
    externalListingIds: [...input.codes],
  }, {
    capability: CHANNELS_REGISTRATION_OPERATION_CAPABILITY,
    ...(await operationLoginOptions(input.mallKey, { automatic: input.automatic })),
  });
  const operationId = outcome.outcome === 'refused' ? outcome.existingOperationId : outcome.operationId;
  if (!operationId) throw new Error(outcome.outcome === 'refused' ? outcome.message : READ_FAILED);
  const operation = await waitForAvailabilityRead(operationId, options);
  // 저장 자격이 몰에서 거절됐으면 그 몰의 자동 로그인을 멈춘다(D10 — 거듭 두드리면 계정이 잠긴다).
  if (operation.status === 'failed') noteOperationLoginFailureForMall(input.mallKey, operation);
  if (operation.status !== 'succeeded') throw new Error(attemptFailureText(operation, MALL_AVAILABILITY_READ_KIND) ?? READ_FAILED);
  const result = MallAvailabilityReadResultSchema.safeParse(operation.result);
  if (!result.success) throw new Error(READ_FAILED);
  return result.data.rows;
}

/**
 * 여러 상품의 몰 지금 재고를 읽는다(등록현황 한 페이지). 몰에서 못 찾은 상품은 결과에 없다. 읽기만 한다.
 * `automatic`: 화면이 스스로 읽는 것(페이지 자동 읽기)이면 자동 로그인 간격을 지킨다.
 */
export async function readMallAvailabilityMany(
  input: { mallKey: string; channelAccountId: string; codes: readonly string[]; automatic?: boolean },
  options: WaitOptions = {},
): Promise<Map<string, MallLiveOption[]>> {
  const codes = [...new Set(input.codes.map((code) => code.trim()).filter(Boolean))];
  const products = new Map<string, MallLiveOption[]>();
  for (let start = 0; start < codes.length; start += MALL_AVAILABILITY_READ_MAX_LISTINGS) {
    const rows = await readChunk({
      mallKey: input.mallKey,
      channelAccountId: input.channelAccountId,
      codes: codes.slice(start, start + MALL_AVAILABILITY_READ_MAX_LISTINGS),
      automatic: input.automatic ?? false,
    }, options);
    for (const row of rows) products.set(row.externalListingId, [...(products.get(row.externalListingId) ?? []), liveOption(row)]);
  }
  return products;
}

/** 상품 하나의 몰 지금 재고. 몰에 없으면 그렇게 말한다. */
export async function readMallAvailability(
  input: { mallKey: string; channelAccountId: string; code: string },
  options: WaitOptions = {},
): Promise<MallLiveOption[]> {
  const products = await readMallAvailabilityMany({ ...input, codes: [input.code] }, options);
  const found = products.get(input.code.trim());
  if (!found) throw new Error('이 상품을 몰에서 찾지 못했습니다.');
  return found;
}
