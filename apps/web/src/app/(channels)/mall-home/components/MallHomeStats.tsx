'use client';

import Link from 'next/link';
import { AlertTriangle, BellRing, KeyRound, PackageX } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { MallAlertFilter } from '../lib/mall-alerts';
import type { LoginNeededCount } from '../lib/mall-session';

const TILE = 'card block w-full rounded-2xl p-4 text-left transition hover:border-slate-300';

/**
 * 쇼핑몰 홈 맨 위 네 칸 — 지금 사람이 볼 것.
 *
 * 앞의 두 칸(확인 필요 · 열린 몰 알림)은 누르면 오른쪽 알림판을 그 칸으로 거른다. 뒤의 두 칸은
 * 해결하러 갈 화면으로 보낸다. 로그인 필요는 세션이 풀린 몰과 계정 정보가 없는 몰을 합친
 * 것이다(둘 다인 몰은 한 번). 못 받은 숫자는 0 이 아니라 `—` 다.
 *
 * 칸마다 파스텔 아이콘 사각형 · 큰 숫자 · 한 줄 설명으로 모양을 맞춘다. 아이콘 색은 칸을
 * 구별하는 표시일 뿐이고, 문제 여부는 숫자와 설명이 말한다.
 */
export function MallHomeStats({
  attention,
  openAlerts,
  loginNeeded,
  soldOut,
  noRecipe,
  onFilter,
}: {
  attention: number;
  /** 아직 열린 몰 원천 실패 알림 수. 못 받았으면 `null`. */
  openAlerts: number | null;
  loginNeeded: LoginNeededCount | null;
  soldOut: number | null;
  /** 레시피가 없어 품절 후보에서 뺀 옵션 수. 못 받았으면 `null`. */
  noRecipe: number | null;
  onFilter: (filter: MallAlertFilter) => void;
}) {
  const loginCaption = loginNeeded
    ? `세션 풀림 ${loginNeeded.signedOut === null ? '—' : formatNumber(loginNeeded.signedOut)} · 계정 정보 없음 ${formatNumber(loginNeeded.noCredentials)}`
    : '계정 설정에서 채우기';
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button type="button" className={TILE} onClick={() => onFilter('attention')}>
        <TileBody
          label="확인 필요"
          value={attention}
          unit="건"
          icon={AlertTriangle}
          tone="bg-amber-50 text-amber-600"
          caption="알림판에서 보기"
        />
      </button>
      <button type="button" className={TILE} onClick={() => onFilter('all')}>
        <TileBody
          label="열린 몰 알림"
          value={openAlerts}
          unit="건"
          icon={BellRing}
          tone={openAlerts ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}
          caption="다시 성공하면 닫힙니다"
        />
      </button>
      <Link href="/mall-settings" className={TILE}>
        <TileBody
          label="로그인 필요"
          value={loginNeeded ? loginNeeded.total : null}
          unit="곳"
          icon={KeyRound}
          tone={loginNeeded?.total ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}
          caption={loginCaption}
        />
      </Link>
      <Link href="/mall-availability" className={TILE}>
        <TileBody
          label="품절 후보"
          value={soldOut}
          unit="개"
          icon={PackageX}
          tone={soldOut ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-400'}
          caption={noRecipe ? `레시피 없음 ${formatNumber(noRecipe)} · 몰에서 직접 품절 처리` : '몰에서 직접 품절 처리'}
        />
      </Link>
    </div>
  );
}

function TileBody({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  iconClassName,
  caption,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon: typeof AlertTriangle;
  tone: string;
  iconClassName?: string;
  caption: string;
}) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-xl', tone)}>
          <Icon size={16} className={iconClassName} aria-hidden />
        </span>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </span>
      {value === null ? (
        <span title="아직 불러오지 못했습니다" className="mt-3 block text-3xl font-bold text-slate-300">
          —
        </span>
      ) : (
        <span className="mt-3 block text-3xl font-bold tabular-nums text-slate-900">
          {formatNumber(value)}
          <span className="ml-1 text-base font-medium text-slate-400">{unit}</span>
        </span>
      )}
      <span className="mt-1.5 block text-xs text-slate-400">{caption}</span>
    </>
  );
}
