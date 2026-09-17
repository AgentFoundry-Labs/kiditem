'use client';

import { Check, Download, Minus, PackageX, Send, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CapabilityKey, CapabilityState } from '../../_shared/mall-capabilities';

export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  orders: '주문수집',
  tracking: '송장전송',
  register: '상품등록',
  soldout: '품절관리',
};

/** 일마다 아이콘이 다르다. 색은 상태가 정하므로, 무슨 일인지는 아이콘과 글자가 말한다. */
export const CAPABILITY_ICON = {
  orders: Download,
  tracking: Truck,
  register: Send,
  soldout: PackageX,
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
 * 색만으로 말하지 않는다 — 카드 줄에는 ✓ · – · ✕ 표시가, 막대 옆에는 글자 풀이가 붙는다.
 */
export const STATE_FILL: Record<CapabilityState, string> = {
  ready: 'bg-emerald-600',
  pending: 'bg-slate-300',
  unavailable: 'bg-red-600',
};

const STATE_TONE: Record<CapabilityState, string> = {
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-slate-200 bg-slate-50 text-slate-400',
  unavailable: 'border-red-200 bg-red-50 text-red-600',
};

const STATE_MARK = { ready: Check, pending: Minus, unavailable: X } as const;

const STATE_HINT: Record<CapabilityKey, Record<CapabilityState, string>> = {
  orders: {
    ready: '이 몰의 주문을 가져올 수 있습니다.',
    pending: '주문수집 경로가 아직 없습니다.',
    unavailable: '이 몰에는 주문수집이 없습니다.',
  },
  tracking: {
    ready: '이 몰에 송장(발송처리)을 올릴 수 있습니다.',
    pending: '송장전송 경로가 아직 없습니다.',
    unavailable: '이 몰에는 송장전송이 없습니다.',
  },
  register: {
    ready: '이 몰의 상품등록 폼을 채울 수 있습니다.',
    pending: '상품등록 경로가 아직 없습니다.',
    unavailable: '이 채널에는 상품등록 개념이 없습니다(발주를 받는 사입 채널).',
  },
  soldout: {
    ready: '이 몰에 품절·해제를 보낼 수 있습니다.',
    pending: '품절 송신 경로가 아직 없습니다 — 품절 관리 화면은 미리보기만 합니다.',
    unavailable: '이 채널에는 품절 송신 개념이 없습니다.',
  },
};

/**
 * 카드 안의 한 줄 — 이 몰로 그 일이 되는가.
 *
 * `note` 는 기본 설명 대신 붙는 사연이다(옥션: G마켓 등록에 함께 올라감 · G마켓 품절:
 * 완전품절이 영구삭제).
 */
export function CapabilityPill({
  kind,
  state,
  note,
  label,
}: {
  kind: CapabilityKey;
  state: CapabilityState;
  note?: string | null;
  /** 줄 이름을 바꿔 부를 때(셀피아가 주문을 가져오는 몰의 '셀피아 주문수집'). */
  label?: string | null;
}) {
  const Icon = CAPABILITY_ICON[kind];
  const Mark = STATE_MARK[state];
  const name = label || CAPABILITY_LABEL[kind];
  return (
    <li
      aria-label={`${name} ${STATE_WORD[state]}`}
      title={note || STATE_HINT[kind][state]}
      className={cn(
        'flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold',
        STATE_TONE[state],
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <Icon size={11} className="flex-none" />
        <span className="truncate">{name}</span>
      </span>
      <Mark size={11} className="flex-none" aria-hidden />
    </li>
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
