/**
 * 사장님 컨펌 보고 — 최종 후보 리스트를 메신저로 보내고 버튼 답장으로 결정을 받는다.
 *
 * 이 파일은 메신저를 모른다. 보고 한 장의 줄 · 굵게 · 링크 · 버튼만 정하고, 실제 서식과
 * 서명은 메신저 어댑터가 붙인다.
 *
 * 버튼 값에는 상태를 싣지 않는다. 누를 때마다 최신 추천과 최종 선택에서 다시 읽으므로, 웹에서
 * 먼저 고른 상품이나 새로 계산된 추천도 그대로 반영된다. 버튼 값이 싣는 것은 "몇 번 · 어느
 * 조직 · 어느 상품" 뿐이다. 텔레그램 버튼 값은 64바이트까지라 상품 열쇠(64자)를 통째로
 * 넣을 수 없어, 열쇠 앞 8바이트만 싣고 최신 후보 안에서 겹치지 않을 때만 찾는다.
 */

export type ConfirmSelectionState = 'neutral' | 'selected' | 'removed';
export type ConfirmItemState = 'pending' | 'approved' | 'rejected';
export type ConfirmAction = 'approve' | 'reject' | 'undo' | 'info';

/** 보고 한 번에 보내는 후보 수의 상한. 넘치면 다음 보고로 넘긴다. */
export const CONFIRM_REPORT_MAX_ITEMS = 40;
/** 메시지 한 장에 담는 후보 수. 버튼 줄이 화면을 넘지 않을 만큼. */
export const CONFIRM_PAGE_SIZE = 8;

const PAYLOAD_VERSION = 'k1';
const ACTION_CODE: Readonly<Record<ConfirmAction, string>> = { approve: 'a', reject: 'r', undo: 'u', info: 'i' };
const CODE_ACTION: Readonly<Record<string, ConfirmAction>> = { a: 'approve', r: 'reject', u: 'undo', i: 'info' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_KEY = /^[0-9a-f]{64}$/i;

export interface ConfirmSegment {
  text: string;
  bold?: boolean;
  href?: string;
}

export type ConfirmLine = readonly ConfirmSegment[];

export interface ConfirmButton {
  label: string;
  /** 서명 전 버튼 값. */
  payload: string;
}

export interface ConfirmMessage {
  lines: readonly ConfirmLine[];
  buttons: readonly (readonly ConfirmButton[])[];
}

export interface ConfirmButtonRef {
  action: ConfirmAction;
  /** 보고 안의 번호(1부터). */
  no: number;
  organizationId: string;
  keyPrefix: string;
}

/** 보고에 적는 후보 한 줄의 재료. */
export interface ConfirmCandidate {
  itemKey: string;
  displayName: string;
  sourceUrl: string | null;
  overseasPriceCny: number | null;
  overseasPriceKrw: number | null;
  salePriceKrw: number | null;
  /** 퍼센트 값(32.5 = 32.5%). */
  estimatedMarginRate: number | null;
  monthlySales: number | null;
  coupangSalePriceKrw: number | null;
}

export interface ConfirmEntry {
  no: number;
  keyPrefix: string;
  /** 최신 추천에서 빠진 상품이면 `null`. */
  candidate: ConfirmCandidate | null;
  state: ConfirmItemState;
}

export function confirmItemState(state: ConfirmSelectionState | null | undefined): ConfirmItemState {
  if (state === 'selected') return 'approved';
  if (state === 'removed') return 'rejected';
  return 'pending';
}

/** 결정 버튼이 최종 선택에 남기는 상태. 되돌리기는 아무것도 고르지 않은 상태로 돌린다. */
export function selectionStateFor(action: Exclude<ConfirmAction, 'info'>): ConfirmSelectionState {
  if (action === 'approve') return 'selected';
  if (action === 'reject') return 'removed';
  return 'neutral';
}

/** 상품 열쇠(16진수 64자)의 앞 8바이트를 base64url 11자로. */
export function itemKeyPrefix(itemKey: string): string {
  if (!ITEM_KEY.test(itemKey)) throw new TypeError('itemKey must be 64 hex characters');
  return Buffer.from(itemKey.slice(0, 16), 'hex').toString('base64url');
}

export function encodeConfirmPayload(ref: ConfirmButtonRef): string {
  if (!Number.isInteger(ref.no) || ref.no < 1 || ref.no > 1295) throw new RangeError('confirm item number out of range');
  if (!UUID.test(ref.organizationId)) throw new TypeError('organizationId must be a UUID');
  if (!/^[A-Za-z0-9_-]{11}$/.test(ref.keyPrefix)) throw new TypeError('keyPrefix must be 11 base64url characters');
  const organization = Buffer.from(ref.organizationId.replaceAll('-', ''), 'hex').toString('base64url');
  return [PAYLOAD_VERSION, ACTION_CODE[ref.action], ref.no.toString(36), organization, ref.keyPrefix].join('.');
}

export function decodeConfirmPayload(payload: string): ConfirmButtonRef | null {
  const parts = payload.split('.');
  if (parts.length !== 5 || parts[0] !== PAYLOAD_VERSION) return null;
  const [, code, no36, organization, keyPrefix] = parts as [string, string, string, string, string];
  const action = CODE_ACTION[code];
  const no = Number.parseInt(no36, 36);
  if (!action || !/^[0-9a-z]{1,2}$/.test(no36) || !Number.isInteger(no) || no < 1) return null;
  if (!/^[A-Za-z0-9_-]{22}$/.test(organization) || !/^[A-Za-z0-9_-]{11}$/.test(keyPrefix)) return null;
  const hex = Buffer.from(organization, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  const organizationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { action, no, organizationId, keyPrefix };
}

/**
 * 한 메시지에 달린 버튼 값들에서 그 메시지가 담은 후보를 되찾는다.
 *
 * 보고를 고쳐 쓸 때 메시지 본문을 믿지 않고 버튼만 본다. 모든 후보는 결정 뒤에도 되돌리기
 * 버튼이 남으므로 버튼만으로 번호와 상품을 모두 되찾을 수 있다. 조직이 섞여 있으면 버린다.
 */
export function entriesFromPayloads(
  payloads: readonly string[],
): { organizationId: string; refs: Array<{ no: number; keyPrefix: string }> } | null {
  const refs = new Map<number, string>();
  let organizationId: string | null = null;
  for (const payload of payloads) {
    const ref = decodeConfirmPayload(payload);
    if (!ref) continue;
    if (organizationId !== null && organizationId !== ref.organizationId) return null;
    organizationId = ref.organizationId;
    if (!refs.has(ref.no)) refs.set(ref.no, ref.keyPrefix);
  }
  if (organizationId === null) return null;
  return {
    organizationId,
    refs: [...refs.entries()].sort(([a], [b]) => a - b).map(([no, keyPrefix]) => ({ no, keyPrefix })),
  };
}

const MARK: Readonly<Record<ConfirmItemState, string>> = { pending: '⬜', approved: '✅', rejected: '❌' };

export function renderConfirmPage(organizationId: string, entries: readonly ConfirmEntry[]): ConfirmMessage {
  const lines: ConfirmLine[] = [];
  const buttons: ConfirmButton[][] = [];
  const button = (action: ConfirmAction, entry: ConfirmEntry, label: string): ConfirmButton => ({
    label,
    payload: encodeConfirmPayload({ action, no: entry.no, organizationId, keyPrefix: entry.keyPrefix }),
  });

  for (const entry of entries) {
    if (lines.length > 0) lines.push([{ text: '' }]);
    if (!entry.candidate) {
      lines.push([{ text: `· ${entry.no}. 새 추천에서 빠진 상품` }]);
      buttons.push([button('info', entry, `· ${entry.no} 빠진 상품`)]);
      continue;
    }
    const { candidate } = entry;
    lines.push([{ text: `${MARK[entry.state]} ${entry.no}. ` }, { text: truncate(candidate.displayName, 80), bold: true }]);
    lines.push([{ text: priceLine(candidate) }]);
    const links: ConfirmSegment[] = [];
    if (candidate.sourceUrl) links.push({ text: '1688에서 보기', href: candidate.sourceUrl });
    if (candidate.coupangSalePriceKrw !== null) {
      links.push({ text: `${links.length > 0 ? ' · ' : ''}쿠팡 비교 ${won(candidate.coupangSalePriceKrw)}` });
    }
    if (links.length > 0) lines.push(links);

    if (entry.state === 'pending') {
      buttons.push([button('approve', entry, `✅ ${entry.no} 승인`), button('reject', entry, `❌ ${entry.no} 반려`)]);
    } else {
      const done = entry.state === 'approved' ? `✅ ${entry.no} 승인됨` : `❌ ${entry.no} 반려됨`;
      buttons.push([button('undo', entry, `${done} · 되돌리기`)]);
    }
  }

  const count = (state: ConfirmItemState) => entries.filter((entry) => entry.candidate && entry.state === state).length;
  lines.push([{ text: '' }]);
  lines.push([{ text: `이 묶음 · 대기 ${count('pending')} · 승인 ${count('approved')} · 반려 ${count('rejected')}` }]);
  return { lines, buttons };
}

export function renderConfirmHeader(input: {
  generatedAt: string;
  total: number;
  pending: number;
  reported: number;
}): ConfirmMessage {
  const lines: ConfirmLine[] = [
    [{ text: '📋 소싱 최종 후보 보고', bold: true }],
    [{ text: `추천 ${kstLabel(input.generatedAt)} 기준 · 후보 ${input.total}개 중 컨펌 대기 ${input.pending}개` }],
  ];
  if (input.reported < input.pending) {
    lines.push([{ text: `이번에는 앞의 ${input.reported}개를 보냅니다. 나머지는 다음 보고에 담깁니다.` }]);
  }
  lines.push([{ text: '' }]);
  lines.push([{ text: '상품마다 ✅ 승인 · ❌ 반려를 눌러 주세요. 누르면 KidItem 최종 선택에 바로 반영됩니다.' }]);
  return { lines, buttons: [] };
}

/** 보고받을 채팅이 아직 정해지지 않았을 때 봇이 알려 주는 연결 안내. */
export function renderSetupReply(chatId: string): ConfirmMessage {
  return {
    lines: [
      [{ text: 'KidItem 컨펌 봇입니다.', bold: true }],
      [{ text: `이 채팅의 ID는 ${chatId} 입니다.` }],
      [{ text: '서버 설정 SOURCING_CONFIRM_TELEGRAM_CHAT_ID 에 이 값을 넣고 서버를 다시 켜면 여기로 컨펌 보고가 옵니다.' }],
    ],
    buttons: [],
  };
}

export function renderHelpReply(): ConfirmMessage {
  return {
    lines: [
      [{ text: 'KidItem 컨펌 봇입니다.', bold: true }],
      [{ text: '보고는 KidItem Agent Org 의 텔레그램 칸에서 보냅니다. 받은 보고의 버튼을 누르면 최종 선택에 반영됩니다.' }],
    ],
    buttons: [],
  };
}

function priceLine(candidate: ConfirmCandidate): string {
  const parts: string[] = [];
  if (candidate.overseasPriceCny !== null) {
    const krw = candidate.overseasPriceKrw !== null ? ` (${won(candidate.overseasPriceKrw)})` : '';
    parts.push(`1688 ¥${trimNumber(candidate.overseasPriceCny)}${krw}`);
  }
  if (candidate.salePriceKrw !== null) parts.push(`판매가 ${won(candidate.salePriceKrw)}`);
  if (candidate.estimatedMarginRate !== null) parts.push(`마진 ${Math.round(candidate.estimatedMarginRate)}%`);
  if (candidate.monthlySales !== null) parts.push(`월 ${Math.round(candidate.monthlySales).toLocaleString('ko-KR')}개`);
  return parts.length > 0 ? `   ${parts.join(' · ')}` : '   가격 정보 없음';
}

function won(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function kstLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '시간 모름';
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('month')}월 ${pick('day')}일 ${pick('hour')}:${pick('minute')}`;
}
