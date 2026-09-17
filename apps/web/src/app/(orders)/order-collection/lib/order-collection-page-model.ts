import { channelCollectsViaExtension } from '@kiditem/shared/channel-registry';
import { formatNumber } from '@/lib/utils';
import type { OrderCollectionFailureCode } from './order-collection-extension';
import type { StoredOrderCollectionFile } from './order-generated-file-store';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

export type ConversionState = 'idle' | 'ready' | 'converting' | 'success' | 'error';
export type ConversionHistoryItem = StoredOrderCollectionFile;

export interface MallAccountDraft {
  loginId: string;
  supplierLoginId: string;
  password: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

export const ACCEPTED_EXTENSIONS = '.txt,.tsv,.csv,.xls,.xlsx';
export const ICECREAM_MALL_KEY = 'icecream-mall';
/** The one mall card whose collection belongs to the Coupang directship owner. */
export const COUPANG_DIRECT_MALL_KEY = 'coupang-direct';
export const MAX_HISTORY_ITEMS = 1000;
export const MALL_ACCOUNT_GRID_CLASS =
  'grid min-w-[760px] grid-cols-[minmax(150px,1.6fr)_minmax(96px,1fr)_80px_112px_88px_148px] gap-2';

export const EMPTY_MALL_DRAFT: MallAccountDraft = {
  loginId: '',
  supplierLoginId: '',
  password: '',
  siteUrl: '',
  memo: '',
  enabled: true,
};

export function stateMessage(state: ConversionState, file: File | null, error: string | null): string {
  if (state === 'converting') return '변환 중';
  if (state === 'success') return '다운로드 완료';
  if (state === 'error') return error ?? '변환 실패';
  if (file) return '변환 대기';
  return '파일 대기';
}

export function countLabel(value: number | null): string {
  return value === null ? '-' : formatNumber(value);
}

export function getOrderCount(result: ConversionHistoryItem | null): number | null {
  if (!result || !isSellpiaOrderFile(result)) return null;
  if (result.outputRows === null || result.productRows === null) return null;
  const orderCount = result.outputRows - result.productRows;
  return orderCount >= 0 ? orderCount : null;
}

export function hasSellpiaTransmissionRequest(item: ConversionHistoryItem): boolean {
  return item.transmissionRequestedAt !== undefined;
}

export function isSellpiaOrderFile(item: ConversionHistoryItem): boolean {
  return item.fileKind !== 'tracking';
}

export function groupHistoryByDay(items: ConversionHistoryItem[]): Array<{
  key: string;
  label: string;
  items: ConversionHistoryItem[];
}> {
  const groups: Array<{ key: string; label: string; items: ConversionHistoryItem[] }> = [];
  const byKey = new Map<string, { key: string; label: string; items: ConversionHistoryItem[] }>();

  for (const item of items) {
    const key = item.collectionDate ?? dayKey(item.convertedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

export function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function mallStatus(account: OrderCollectionMallAccount): { label: string; tone: 'empty' | 'paused' | 'ready' } {
  if (!account.configured) return { label: '미설정', tone: 'empty' };
  if (!account.enabled) return { label: '중지', tone: 'paused' };
  return { label: '사용', tone: 'ready' };
}

/**
 * 이 몰을 브라우저에서 수집할 수 있는가 — 판정은 채널 레지스트리의 `collector` 하나다.
 *
 * 화면이 몰 목록을 다시 적던 동안 서버와 갈라졌다(카카오는 여기만 켜져 있었고 로켓은
 * 서버만 켜져 있었다). 아이스크림몰만 예외로 설정·사용 여부까지 본다 — 저장된 계정으로
 * 로그인해 들어가는 몰이라 계정이 없으면 수집 자체가 시작되지 않는다.
 */
export function isBrowserCollectableMall(account: OrderCollectionMallAccount): boolean {
  if (!channelCollectsViaExtension(account.key)) return false;
  return account.key !== ICECREAM_MALL_KEY || (account.configured && account.enabled);
}

export function isAutoDetectableMall(account: OrderCollectionMallAccount): boolean {
  return account.enabled && isBrowserCollectableMall(account);
}

export function formatMallCollectionTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

export function draftFromMallAccount(account: OrderCollectionMallAccount): MallAccountDraft {
  return {
    loginId: account.loginId ?? '',
    supplierLoginId: account.supplierLoginId ?? '',
    password: '',
    siteUrl: account.siteUrl ?? '',
    memo: account.memo ?? '',
    enabled: account.enabled,
  };
}

export function todayYmd(): string {
  const now = new Date();
  return dayKey(now.getTime());
}

/**
 * 수집/변환 실패 메시지가 사실은 "신규 주문 없음"(정상, 오류 아님)인지 판별한다.
 * 티쳐몰·보리보리처럼 주문이 없을 때 throw 하는 몰을, 다른 몰과 동일하게 활동 피드에서
 * "신규 주문 없음"으로 표기하기 위해 사용한다. 로그인/권한/타임아웃 같은 진짜 오류는 제외한다.
 */
export function isNoNewOrdersMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/로그인|필요|권한|찾을 수 없|초과|불러오지/.test(message)) return false;
  return /주문이?\s*없/.test(message);
}

/**
 * 확장프로그램이 보낸 구조화 실패 코드를 읽는다. 표시 문구는 운영자 안내용이며
 * 실행 상태 판정에는 이 코드를 우선 사용한다.
 */
export function getOrderCollectionFailureCode(value: unknown): OrderCollectionFailureCode | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    errorCode?: unknown;
    failure?: { code?: unknown } | null;
  };
  const code = candidate.failure?.code ?? candidate.errorCode;
  return code === 'login_required' ||
    code === 'operator_action_required' ||
    code === 'provider_contract_changed' ||
    code === 'network_failed' ||
    code === 'unknown_failure'
    ? code
    : null;
}

/**
 * 수집 실패가 "추가 인증 필요"(SMS 등)인지 판별한다. 예: GS샵 SMS 인증방식.
 * 활동 피드에서 일반 오류가 아니라 "인증 필요"로 표기하기 위해 사용하며,
 * 로그인 필요 판별보다 먼저 분기해야 한다(인증 안내에도 "로그인" 단어가 섞이므로).
 */
export function isAuthRequiredMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  // 확장의 `AUTH_PATTERNS`(collection-failure.js)와 같은 뜻이어야 한다. 한쪽만 고치지 말 것.
  return /인증번호|인증이?\s*필요|SMS\s*인증|인증\s*방식|2단계\s*인증|추가\s*인증|OTP/i.test(
    message,
  );
}

/**
 * 브라우저가 원인 없이 던지는 네트워크 실패("Failed to fetch" 등)인지 판별한다.
 * 몰 수집 중에는 대부분 로그인 세션이 끊겨 로그인 페이지로 밀려난 경우다.
 */
export function isNetworkFailureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(
    message,
  );
}

/**
 * 수집 실패가 "로그인/세션 필요"인지 판별한다.
 * 활동 피드에서 일반 오류가 아니라 "로그인 필요"로 표기하기 위해 사용한다.
 * 원인 없는 네트워크 실패도 몰 수집 맥락에서는 로그인 세션 문제로 보고 조치를 안내한다.
 */
export function isLoginRequiredMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  if (isNetworkFailureMessage(message)) return true;
  return /로그인|세션이?\s*만료|세션\s*만료/.test(message);
}

export type OrderCollectionFailureKind = 'empty' | 'auth' | 'login' | 'error';

/** Manual collection and auto-detection classify the same extension result identically. */
export function classifyOrderCollectionFailure(
  value: unknown,
  message: string | null | undefined,
): OrderCollectionFailureKind {
  const code = getOrderCollectionFailureCode(value);
  if (code === 'operator_action_required') return 'auth';
  if (code === 'login_required') return 'login';
  if (code) return 'error';
  if (isNoNewOrdersMessage(message)) return 'empty';
  if (isAuthRequiredMessage(message)) return 'auth';
  if (isLoginRequiredMessage(message)) return 'login';
  return 'error';
}

/**
 * 로그인·인증이 풀린 것은 실패가 아니라 운영자가 할 일이다. 몰 카드·활동 기록과 같은
 * 말로 알려, 원천이 무엇이든 같은 문장을 보게 한다(KID-163).
 */
export function collectionAttentionNotice(
  sourceName: string,
  value: unknown,
  message: string,
): Readonly<{ tone: 'warning' | 'error'; message: string }> {
  const kind = classifyOrderCollectionFailure(value, message);
  if (kind === 'login') return { tone: 'warning', message: `로그인 필요 · ${sourceName} · ${message}` };
  if (kind === 'auth') return { tone: 'warning', message: `인증 필요 · ${sourceName} · ${message}` };
  return { tone: 'error', message };
}

/**
 * 사용자에게 그대로 보여주면 원인도 조치도 알 수 없는 raw 오류를 안내 문구로 바꾼다.
 * 그 외 메시지는 몰이 알려준 내용이 더 정확하므로 손대지 않는다.
 */
export function mallCollectionFailureMessage(
  mallName: string,
  message: string,
): string {
  if (!isNetworkFailureMessage(message)) return message;
  return `${mallName} 연결이 끊겼습니다. 로그인 상태(또는 네트워크)를 확인한 뒤 다시 수집해주세요.`;
}

export type OrderCollectionBatchNotice = Readonly<{
  tone: 'success' | 'warning';
  message: string;
}>;

/**
 * 전체 수집 한 번을 운영자 문장 하나로 요약한다. 이미 수집 중이던 몰은 두 번째 시도를 열지
 * 않았을 뿐 실패한 것이 아니고(KID-106 Q6), 아직 설정되지 않은 몰은 시작 자체가 없었던
 * 것이므로(KID-170 D1), 둘 다 실패와 따로 센다.
 */
export function orderCollectionBatchNotice(result: {
  successCount: number;
  failedCount: number;
  inProgressCount: number;
  unconfiguredCount: number;
  /** 사람이 직접 로그인해야 해서 이번 수집에서 뺀 몰 수. */
  skippedCount?: number;
}): OrderCollectionBatchNotice {
  const parts = [`${formatNumber(result.successCount)}개 성공`];
  if (result.failedCount > 0) parts.push(`${formatNumber(result.failedCount)}개 실패`);
  if (result.unconfiguredCount > 0) {
    parts.push(`${formatNumber(result.unconfiguredCount)}개 미설정`);
  }
  if (result.inProgressCount > 0) parts.push(`${formatNumber(result.inProgressCount)}개 진행 중`);
  if (result.skippedCount) {
    parts.push(`${formatNumber(result.skippedCount)}개 건너뜀(직접 로그인 필요)`);
  }
  if (parts.length === 1) return { tone: 'success', message: '전체 수집 완료' };
  return { tone: 'warning', message: `전체 수집 ${parts.join(', ')}` };
}

export function dayKey(timestamp: number): string {
  const now = new Date(timestamp);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
}
