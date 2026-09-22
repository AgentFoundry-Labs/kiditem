'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Rocket } from 'lucide-react';
import {
  FORM_MALL_ADAPTERS,
  type MallReadiness,
} from '../../../../(channels)/_shared/mall-register-values';
import type { MallRunOutcome } from '../lib/mall-quick-register-run';

/**
 * 수집상품 모달의 몰 등록 표.
 *
 * 생김새는 통합관리 솔루션(플레이오토 2.0 `쇼핑몰 전송`)에서 가져왔다. 거기서 배운 것 셋 —
 *
 *  1. **줄마다 버튼을 두지 않는다.** 체크박스로 고르고 액션 버튼은 아래 하나다. 몰이
 *     여덟이면 같은 초록 버튼이 여덟 개 늘어서는데, 그러면 어디를 누를지가 아니라
 *     "무엇을 고를지" 라는 진짜 결정이 묻힌다.
 *  2. **상태는 배지로 말한다.** 대기·채우는 중·채움·실패·값 필요. 플레이오토가
 *     `판매대기 → 판매중` 을 보여주는 자리다.
 *  3. **고른 개수를 먼저 보여준다.** 플레이오토는 보내기 전에 `선택 상품 : 4건` 을 묻는다.
 *     우리는 버튼 글자에 그 수를 넣어 같은 확인을 준다.
 *
 * 그들과 다르게 하는 것 하나 — **실패 사유를 그 줄에 적는다.** 플레이오토는 결과를 별도
 * `작업` 페이지로 보내지만, 우리는 몰이 여덟뿐이라 화면을 옮길 이유가 없다.
 *
 * 값은 여기서 묻지 않는다. 몰마다 채워야 하는 값은 상품 상세에 한 번 적어 둔다.
 */

/** 폼을 채우는 몰만. 엑셀 경로는 별도 버튼이 이미 있다. */
export const QUICK_REGISTER_ADAPTERS = FORM_MALL_ADAPTERS;

/**
 * 막힌 줄의 이유 한 문단.
 *
 * 어댑터가 쓴 이유가 먼저다. 비어 있는 칸 이름은 이유가 이미 그 칸을 부르지 않았을 때만
 * 덧붙인다 — 카테고리 칸이나 팀구매가처럼 이유와 칸 이름이 같은 말을 두 번 하면 줄이
 * 두 배로 길어지고, 사람은 무엇이 빠졌는지 오히려 못 읽는다.
 */
export function blockedRowMessage(row: Pick<MallReadiness, 'reasons' | 'missingFieldLabels'>): string {
  const unmentioned = row.missingFieldLabels.filter(
    (label) => !row.reasons.some((reason) => reason.includes(label)),
  );
  return [
    ...row.reasons,
    ...(unmentioned.length > 0 ? [`${unmentioned.join(', ')} 을(를) 상품 상세에서 채우세요.`] : []),
  ].join(' ');
}

export interface WingQuickRegisterRow {
  row: MallReadiness;
  busy: boolean;
  /** 준비 단계 문구(상세페이지 렌더 등). 없으면 기본 배지 글자를 쓴다. */
  busyLabel: string | null;
  result: MallRunOutcome | null;
}

interface MallQuickRegisterRowsProps {
  /** 몰마다 "지금 보낼 수 있느냐"와 "왜 못 보내느냐". 판정은 어댑터가 한다. */
  readiness: readonly MallReadiness[];
  /** 이번 모달에서 이미 돌린 결과. 몰키 → 결과. */
  results: Readonly<Record<string, MallRunOutcome>>;
  /**
   * 지금 폼을 채우는 중인 몰키들. 비어 있으면 도는 것이 없다.
   *
   * 하나가 아니라 여럿인 까닭 — 등록은 묶음으로 동시에 돈다. 칸이 하나면 마지막에 시작한
   * 몰만 `채우는 중` 이 되고 나머지는 `대기` 로 보여, 도는 동안 아무 일도 안 하는 것처럼 보인다.
   */
  runningMallKeys: readonly string[];
  /** 저장된 값을 아직 못 읽었다. */
  isLoading: boolean;
  disabled: boolean;
  /** 상품 상세로 가는 주소. 빠진 값을 채우러 간다. */
  detailHref: string | null;
  /** 모달이 고른 상품 수. 폼 방식은 화면 하나에 상품 하나다. */
  targetCount: number;
  /**
   * 쿠팡 WING 줄. 폼 몰과 달리 앱 안에서 확인 창을 한 번 거치므로 따로 받는다.
   * 없으면 줄을 세우지 않는다.
   */
  wing: WingQuickRegisterRow | null;
  /** 고른 몰만 보낸다. 묶음으로 동시에 연다. */
  onRunSelected: (mallKeys: string[]) => void;
  /** 그 몰 하나만 보낸다. 선택과 무관하다. */
  onRunOne: (mallKey: string) => void;
}

type RowStatus = 'blocked' | 'idle' | 'running' | 'filled' | 'failed';

const STATUS_STYLE: Record<RowStatus, { label: string; className: string }> = {
  blocked: { label: '값 필요', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  idle: { label: '대기', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
  running: { label: '채우는 중', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  filled: { label: '채움', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: '실패', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export function MallQuickRegisterRows({
  readiness,
  results,
  runningMallKeys,
  isLoading,
  disabled,
  detailHref,
  targetCount,
  wing,
  onRunSelected,
  onRunOne,
}: MallQuickRegisterRowsProps) {
  // 쿠팡을 맨 위에 둔다. 매출이 가장 큰 채널이라 먼저 보이는 편이 낫다.
  const rows = useMemo(
    () => (wing ? [wing.row, ...readiness] : [...readiness]),
    [wing, readiness],
  );
  const running = runningMallKeys.length > 0 || (wing?.busy ?? false);
  const readyKeys = useMemo(
    () => rows.filter((row) => row.ready).map((row) => row.mallKey),
    [rows],
  );
  const blocked = rows.filter((row) => !row.ready);

  // 보낼 수 있는 몰은 처음부터 다 골라 둔다. 여덟 번 체크하게 만들 이유가 없다 —
  // 빼고 싶은 몰만 손대면 된다.
  const [touched, setTouched] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // 사람이 손대기 전까지는 준비된 몰을 따라간다. 상세에서 값을 채우고 돌아오면
    // 그 몰도 저절로 골라져 있어야 한다.
    if (!touched) setPicked(new Set(readyKeys));
    else setPicked((current) => new Set(readyKeys.filter((key) => current.has(key))));
  }, [readyKeys, touched]);

  const selected = readyKeys.filter((key) => picked.has(key));
  const allPicked = readyKeys.length > 0 && selected.length === readyKeys.length;

  const pick = (mallKey: string, next: boolean) => {
    setTouched(true);
    setPicked((current) => {
      const updated = new Set(current);
      if (next) updated.add(mallKey);
      else updated.delete(mallKey);
      return updated;
    });
  };

  const statusOf = (row: MallReadiness): RowStatus => {
    if (!row.ready) return 'blocked';
    const isWing = wing?.row.mallKey === row.mallKey;
    if (isWing ? wing.busy : runningMallKeys.includes(row.mallKey)) return 'running';
    const result = isWing ? wing.result : results[row.mallKey] ?? null;
    if (!result) return 'idle';
    return result.status === 'filled' ? 'filled' : 'failed';
  };

  if (isLoading) {
    return (
      <div className="mb-4 mt-3 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-6 text-xs font-bold text-slate-500">
        <Loader2 size={14} className="animate-spin" />
        저장된 몰 등록 정보를 읽는 중
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            aria-label="전체 선택"
            checked={allPicked}
            disabled={disabled || running || readyKeys.length === 0}
            onChange={(event) => {
              setTouched(true);
              setPicked(event.target.checked ? new Set(readyKeys) : new Set());
            }}
            className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
          />
          <span className="text-[11px] font-black text-slate-600">
            {selected.length}/{readyKeys.length}개 몰 선택
          </span>
          {blocked.length > 0 ? (
            <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-200">
              값 필요 {blocked.length}
            </span>
          ) : null}
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const status = statusOf(row);
            const isWing = wing?.row.mallKey === row.mallKey;
            const result = isWing ? wing.result : results[row.mallKey] ?? null;
            const badge = STATUS_STYLE[status];
            const busyLabel = isWing && wing.busyLabel ? wing.busyLabel : badge.label;
            return (
              <div key={row.mallKey} className={status === 'blocked' ? 'bg-slate-50/60' : ''}>
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* 버튼을 label 안에 두면 누를 때 체크가 함께 토글된다. 고르는 영역과
                      누르는 영역을 나눠 둔다. */}
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={row.mallName}
                      checked={picked.has(row.mallKey)}
                      disabled={disabled || running || !row.ready}
                      onChange={(event) => pick(row.mallKey, event.target.checked)}
                      className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                    />
                    <span
                      className={`w-[68px] shrink-0 truncate text-xs font-black ${
                        row.ready ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {row.mallName}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-500">
                      {row.summary.length > 0
                        ? row.summary.map((cell) => `${cell.label} ${cell.value}`).join(' · ')
                        : isWing
                          ? '확인 창에서 검토 후 등록'
                          : ''}
                    </span>
                  </label>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${badge.className}`}
                  >
                    {status === 'running' ? <Loader2 size={9} className="animate-spin" /> : null}
                    {status === 'running' ? busyLabel : badge.label}
                  </span>
                  {/* 이 몰만 보내는 버튼. 아래 일괄 버튼이 주인공이라 조용하게 둔다 —
                      여기서 목소리를 키우면 예전처럼 같은 버튼 여덟 개가 된다. */}
                  <button
                    type="button"
                    aria-label={`${row.mallName}만 등록`}
                    title={`${row.mallName}만 등록합니다`}
                    onClick={() => onRunOne(row.mallKey)}
                    disabled={disabled || running || !row.ready}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {status === 'filled' || status === 'failed' ? '다시' : '등록'}
                  </button>
                </div>
                {status === 'blocked' ? (
                  <p className="px-3 pb-2 pl-[30px] text-[11px] font-semibold text-amber-600">
                    {blockedRowMessage(row)}
                  </p>
                ) : null}
                {result && result.status !== 'filled' ? (
                  <p className="px-3 pb-2 pl-[30px] text-[11px] font-bold text-red-600">
                    {result.message}
                  </p>
                ) : null}
                {result?.status === 'filled' && result.manualSteps.length > 0 ? (
                  <p className="px-3 pb-2 pl-[30px] text-[11px] font-semibold text-slate-500">
                    {result.manualSteps.join(' ')}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {blocked.length > 0 && detailHref ? (
        <Link
          href={detailHref}
          className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
        >
          <AlertCircle size={13} />
          {blocked.length}개 몰이 값을 기다립니다 — 상품 상세에서 채우기
        </Link>
      ) : null}

      {/* 몰이 열여덟이라 표가 모달보다 길다. 스크롤해도 일괄 버튼은 아래에 붙어 있게 한다. */}
      <div className="sticky bottom-0 mt-2 border-t border-slate-100 bg-white pb-4 pt-3">
        <button
          type="button"
          onClick={() => onRunSelected(selected)}
          disabled={disabled || running || selected.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
          {running ? '몰을 열어 채우는 중' : `선택한 ${selected.length}개 몰에 등록`}
        </button>

        <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
          폼만 채웁니다 · 한 몰이 막혀도 나머지는 계속합니다
          {wing ? ' · 쿠팡 WING 은 맨 마지막에 확인 창이 뜹니다' : ''}
          {targetCount > 1 ? ` · 고른 ${targetCount}개 중 첫 상품만 엽니다` : ''}
        </p>
      </div>
    </div>
  );
}
