'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  CircleAlert,
  Clock3,
  PauseCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  getOfficeDestination,
  getOfficeMotionPoints,
  type OfficeSeat,
} from '../lib/agent-office-layout';
import type {
  AgentOfficeNode,
  AgentOfficeNodeStatus,
} from '../lib/agent-office-model';

const BUBBLE_DURATION_MS = 6_000;

const STATUS_LABEL = {
  working: '집중 중',
  waiting: '대기 중',
  blocked: '승인 필요',
  idle: '준비됨',
  offline: '오프라인',
} satisfies Record<AgentOfficeNodeStatus, string>;

const STATUS_CLASS = {
  working: 'border-cyan-500 bg-cyan-50 text-cyan-900',
  waiting: 'border-amber-500 bg-amber-50 text-amber-900',
  blocked: 'border-red-600 bg-red-50 text-red-800',
  idle: 'border-green-600 bg-green-50 text-green-800',
  offline: 'border-slate-400 bg-slate-100 text-slate-600',
} satisfies Record<AgentOfficeNodeStatus, string>;

function StatusIcon({ status }: { status: AgentOfficeNodeStatus }) {
  if (status === 'blocked') return <CircleAlert size={13} aria-hidden="true" />;
  if (status === 'waiting') return <Clock3 size={13} aria-hidden="true" />;
  if (status === 'offline') return <PauseCircle size={13} aria-hidden="true" />;
  return <Sparkles size={13} aria-hidden="true" />;
}

function reducedMotionEnabled() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function AgentOfficeAvatar({
  node,
  seat,
  selected,
  activityLabel,
  onSelect,
}: {
  node: AgentOfficeNode;
  seat: OfficeSeat;
  selected: boolean;
  activityLabel: string | null;
  onSelect: (id: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousStatusRef = useRef(node.status);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bubbleLabel, setBubbleLabel] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState(seat.avatarSrc);
  const destination = getOfficeDestination(seat, node.status);

  useEffect(() => {
    setAvatarSrc(seat.avatarSrc);
  }, [seat.avatarSrc]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus === node.status) return;

    if (
      node.status !== 'offline' &&
      !reducedMotionEnabled() &&
      typeof buttonRef.current?.animate === 'function'
    ) {
      const points = getOfficeMotionPoints({
        seat,
        fromStatus: previousStatus,
        toStatus: node.status,
      });
      buttonRef.current.animate(
        points.map((point) => ({
          left: `${point.x}%`,
          top: `${point.y}%`,
        })),
        {
          duration: 900,
          easing: 'ease-in-out',
        },
      );
    }

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubbleLabel(activityLabel);
    if (activityLabel) {
      bubbleTimerRef.current = setTimeout(
        () => setBubbleLabel(null),
        BUBBLE_DURATION_MS,
      );
    }

    previousStatusRef.current = node.status;
  }, [activityLabel, node.status, seat]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={`${node.displayName}, ${STATUS_LABEL[node.status]}`}
      aria-pressed={selected}
      data-status={node.status}
      onClick={() => onSelect(node.id)}
      style={{
        left: `${destination.x}%`,
        top: `${destination.y}%`,
      }}
      className="group absolute z-20 h-[116px] w-[142px] -translate-x-1/2 -translate-y-1/2 text-left focus-visible:outline-none"
    >
      {bubbleLabel ? (
        <span
          role="status"
          className="absolute bottom-[104px] left-1/2 w-max max-w-[180px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-[11px] text-slate-700 shadow-sm"
        >
          {bubbleLabel}
        </span>
      ) : null}

      <span
        className={cn(
          'absolute left-1/2 top-0 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold shadow-sm',
          STATUS_CLASS[node.status],
        )}
      >
        <StatusIcon status={node.status} />
        {STATUS_LABEL[node.status]}
      </span>

      <span
        className={cn(
          'absolute left-1/2 top-7 flex h-14 w-14 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-sm',
          selected
            ? 'ring-4 ring-purple-600/70'
            : 'group-hover:ring-2 group-hover:ring-purple-300',
          'group-focus-visible:ring-4 group-focus-visible:ring-purple-600/70',
          node.status === 'offline' && 'grayscale opacity-70',
        )}
      >
        <Image
          data-testid="employee-avatar-image"
          src={avatarSrc}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-contain"
          onError={() => {
            if (avatarSrc !== DEFAULT_OFFICE_AVATAR_SRC) {
              setAvatarSrc(DEFAULT_OFFICE_AVATAR_SRC);
            }
          }}
        />
      </span>

      <span className="absolute left-1/2 top-[82px] w-[136px] -translate-x-1/2 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-center shadow-sm">
        <span className="block truncate text-xs font-semibold text-slate-900">
          {node.displayName}
        </span>
        <span className="block truncate text-[10px] text-slate-500">
          {node.name}
        </span>
      </span>
    </button>
  );
}
