'use client';

import {
  Boxes,
  Download,
  MessageCircleQuestion,
  MessageSquareReply,
  PackageCheck,
  PackageX,
  PencilLine,
  RotateCcw,
  Send,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CapabilityKey, CapabilityState } from '../../_shared/mall-capabilities';

/**
 * 칸 이름은 사방넷 스케줄러와 같다 — 사장님이 두 화면을 같은 말로 읽는다. 사방넷의 상품상태송신 한 칸만
 * 사장님 말대로 품절관리 · 판매재개 둘로 가른다(2026-09-19).
 */
export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  orders: '주문수집',
  claims: '클레임수집',
  tracking: '운송장 송신',
  inquiries: '문의수집',
  inquiryReplies: '문의답변',
  register: '상품등록',
  update: '상품수정',
  soldout: '품절관리',
  resume: '판매재개',
  stock: '재고송신',
};

/** 일마다 아이콘이 다르다. 색은 상태가 정하므로, 무슨 일인지는 아이콘과 글자가 말한다. */
export const CAPABILITY_ICON = {
  orders: Download,
  claims: RotateCcw,
  tracking: Truck,
  inquiries: MessageCircleQuestion,
  inquiryReplies: MessageSquareReply,
  register: Send,
  update: PencilLine,
  soldout: PackageX,
  resume: PackageCheck,
  stock: Boxes,
} as const;

export const STATE_WORD: Record<CapabilityState, string> = {
  ready: '됨',
  pending: '아직',
  unavailable: '불가',
};

/** 상태 순서. 막대도 풀이도 이 순서로 선다. */
export const CAPABILITY_STATES = ['ready', 'pending', 'unavailable'] as const;

/**
 * 상태의 채움색 — 요약 막대와 풀이 점이 같은 색을 쓴다.
 * 초록·빨강은 디자인 시스템의 성공·위험(`green`/`red` 600 계열)이고, 회색은 '아직'이다.
 * 색만으로 말하지 않는다 — 줄의 스위치에는 ON · OFF · 불가 글자가, 막대 옆에는 글자 풀이가 붙는다.
 */
export const STATE_FILL: Record<CapabilityState, string> = {
  ready: 'bg-emerald-600',
  pending: 'bg-slate-300',
  unavailable: 'bg-red-600',
};

/** 스위치 판의 색 — 켜짐은 초록 판, 꺼짐은 회색 판, 불가는 진한 빨강 판에 흰 글씨다(사장님 2026-09-19). */
const SWITCH_TRACK: Record<CapabilityState, string> = {
  ready: 'border-emerald-600 bg-emerald-500 text-white',
  pending: 'border-slate-300 bg-slate-200 text-slate-500',
  unavailable: 'border-red-700 bg-red-600 text-white',
};

/** 스위치 판에 새기는 말. 셀피아처럼 다른 길로 되는 칸은 그 길 이름이 이 자리에 선다. */
const SWITCH_WORD: Record<CapabilityState, string> = {
  ready: 'ON',
  pending: 'OFF',
  unavailable: '불가',
};

const SUPPLY_CHANNEL = '발주를 받는 사입 채널에는 이 일이 없습니다.';

const STATE_HINT: Record<CapabilityKey, Record<CapabilityState, string>> = {
  orders: {
    ready: '이 몰의 주문을 가져올 수 있습니다.',
    pending: '주문수집 경로가 아직 없습니다.',
    unavailable: '이 몰에는 주문수집이 없습니다.',
  },
  claims: {
    ready: '이 몰의 취소 · 반품 · 교환을 가져올 수 있습니다.',
    pending: '클레임(취소 · 반품 · 교환) 수집 경로가 아직 없습니다.',
    unavailable: SUPPLY_CHANNEL,
  },
  tracking: {
    ready: '이 몰에 송장(발송처리)을 올릴 수 있습니다.',
    pending: '운송장 송신 경로가 아직 없습니다.',
    unavailable: '이 몰에는 운송장 송신이 없습니다.',
  },
  inquiries: {
    ready: '이 몰의 고객 문의를 가져올 수 있습니다.',
    pending: '문의수집 경로가 아직 없습니다.',
    unavailable: SUPPLY_CHANNEL,
  },
  inquiryReplies: {
    ready: '이 몰의 고객 문의에 답을 올릴 수 있습니다.',
    pending: '문의답변 경로가 아직 없습니다.',
    unavailable: SUPPLY_CHANNEL,
  },
  register: {
    ready: '이 몰의 상품등록 폼을 채울 수 있습니다.',
    pending: '상품등록 경로가 아직 없습니다.',
    unavailable: '이 채널에는 상품등록 개념이 없습니다(발주를 받는 사입 채널).',
  },
  update: {
    ready: '이 몰에 등록된 상품의 수정(가격 · 상품명 · 상세)을 보낼 수 있습니다.',
    pending: '상품수정 송신 경로가 아직 없습니다.',
    unavailable: SUPPLY_CHANNEL,
  },
  soldout: {
    ready: '이 몰에 품절을 보낼 수 있습니다 — 등록현황 칸 · 품절 관리에서 상품마다.',
    pending: '품절 송신 경로가 아직 없습니다 — 품절 관리 화면은 미리보기만 합니다.',
    unavailable: '이 채널에는 품절 송신 개념이 없습니다.',
  },
  resume: {
    ready: '이 몰에 판매재개(품절 해제)를 보낼 수 있습니다 — 등록현황 칸 · 품절 관리에서 상품마다.',
    pending: '판매재개 송신 경로가 아직 없습니다.',
    unavailable: '이 채널에는 판매재개를 보낼 수 없습니다.',
  },
  stock: {
    ready: '이 몰에 재고 수량을 보낼 수 있습니다.',
    pending: '재고송신 경로가 아직 없습니다.',
    unavailable: SUPPLY_CHANNEL,
  },
};

/**
 * 표의 한 칸 — 이 몰로 그 일이 되는가. 모양은 사방넷처럼 ON/OFF 스위치다(사장님 2026-09-19 "이 방식처럼"):
 * 되면 초록 판에 손잡이가 오른쪽(ON), 아직이면 회색 판에 손잡이가 왼쪽(OFF), 그 몰에 없는 일은 진한 빨강 판(불가).
 * 셀피아로 되는 칸은 ON 자리에 '셀피아'라고 적는다. **누르는 스위치가 아니다** — 켜고 끄는 것은 설정 창의 사용여부
 * 하나이고, 이 칸은 그 일이 지금 되는지만 말한다. 칸의 이름(`aria-label`)은 언제나 '일 이름 + 됨/아직/불가'다.
 *
 * `label` 은 칸 이름을 바꿔 부를 때(셀피아가 주문을 가져오는 몰의 '셀피아 주문수집'), `note` 는
 * 기본 설명 대신 붙는 사연이다(옥션: G마켓 등록에 함께 올라감 · 완전품절이 영구삭제인 몰).
 */
export function CapabilityCell({
  kind,
  state,
  note,
  label,
}: {
  kind: CapabilityKey;
  state: CapabilityState;
  note?: string | null;
  label?: string | null;
}) {
  const name = label || CAPABILITY_LABEL[kind];
  // 셀피아처럼 길이 다른 초록은 ON 자리에 그 길 이름을 적는다.
  const via = label && state === 'ready' ? label.replace(CAPABILITY_LABEL[kind], '').trim() : '';
  const on = state === 'ready';
  return (
    <span
      role="img"
      aria-label={`${name} ${STATE_WORD[state]}`}
      title={note || STATE_HINT[kind][state]}
      className={cn(
        'relative inline-flex h-5 w-14 flex-none items-center rounded-full border text-[9px] font-bold shadow-inner',
        SWITCH_TRACK[state],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/5',
          on ? 'right-px' : 'left-px',
        )}
      />
      <span aria-hidden className={cn('w-full whitespace-nowrap', on ? 'pl-1.5 pr-5 text-left' : 'pl-5 pr-1.5 text-right')}>
        {via || SWITCH_WORD[state]}
      </span>
    </span>
  );
}

/** 색 풀이. 몇 곳인지는 맨 위 요약이 말하고, 여기는 색이 무엇을 뜻하는지만 적는다. */
export function CapabilityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {CAPABILITY_STATES.map((state) => (
        <span key={state} className="inline-flex items-center gap-1">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', STATE_FILL[state])} />
          {STATE_WORD[state]}
        </span>
      ))}
    </div>
  );
}
