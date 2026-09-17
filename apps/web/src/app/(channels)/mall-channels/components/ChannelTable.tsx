'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { cn, formatNumber } from '@/lib/utils';
import { mallAccentClass, mallLogoPath, mallMonogram } from '../../_shared/mall-presentation';
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityTotals,
  type MallCapabilities,
} from '../../_shared/mall-capabilities';
import {
  CAPABILITY_ICON,
  CAPABILITY_LABEL,
  CAPABILITY_STATES,
  CapabilityCell,
  STATE_FILL,
  STATE_WORD,
} from './CapabilityPill';

export interface ChannelTableRow {
  channel: MallChannelSummary;
  capabilities: MallCapabilities;
  notes?: Partial<Record<CapabilityKey, string | null>>;
  labels?: Partial<Record<CapabilityKey, string | null>>;
}

/** 쇼핑몰 계정 화면에 저장된 그 몰의 계정. 없으면 `null`. */
export interface ChannelAccountInfo {
  loginId: string | null;
  enabled: boolean;
}

/**
 * 연결된 몰 표 — 사방넷 스케줄러와 같은 모양이다(사장님 2026-09-17).
 *
 * 한 줄이 몰 하나다. 쇼핑몰 · 쇼핑몰 ID · 사용여부 · 설정 · 등록 상품, 그리고 되는 일 아홉 칸.
 * 등록 상품은 그 몰의 상품을 가져온 적이 없으면 0 이 아니라 `—` 다(모른다). 사방넷은
 * 칸마다 켜고 끄는 스위치를 두지만, 우리 칸은 **그 일이 지금 되는지**를 말한다 — 누를 수 없는
 * 스위치를 그리면 켜 둔 줄 알고 기다리게 된다. 켜고 끄는 것은 계정 화면의 사용여부 하나다.
 *
 * 칸 머리에는 연결된 몰 중 몇 곳에서 되는지가 선다. 표가 넓어 가로로 밀리므로 몰 이름 칸은
 * 왼쪽에 붙어 있다.
 */
export function ChannelTable({
  rows,
  totals,
  accounts,
}: {
  rows: readonly ChannelTableRow[];
  totals: CapabilityTotals;
  /** 몰 키 → 쇼핑몰 계정. 아직 못 받았으면 `null`. */
  accounts: ReadonlyMap<string, ChannelAccountInfo> | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1260px] border-collapse text-xs">
        <caption className="sr-only">연결된 몰마다 되는 일</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
            <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left">쇼핑몰</th>
            <th scope="col" className="px-2 py-2.5 text-left">쇼핑몰 ID</th>
            <th scope="col" className="px-2 py-2.5 text-center">사용여부</th>
            <th scope="col" className="px-2 py-2.5 text-center">설정</th>
            <th scope="col" className="px-2 py-2.5 text-right">등록 상품</th>
            <th scope="col" className="px-2 py-2.5 text-right">매칭률</th>
            {CAPABILITY_KEYS.map((key) => (
              <th key={key} scope="col" className="px-1.5 py-2.5 text-center align-top">
                <CapabilityHeader kind={key} counts={totals[key]} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ChannelRow
              key={row.channel.mallKey}
              row={row}
              account={accounts ? accountFor(accounts, row.channel.mallKey) : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 몰 키로 계정을 찾는다. 쿠팡 로켓 칸은 쇼핑몰 계정에서 '쿠팡직배송' 으로 불린다 — 직배송
 * 자격증명이 로켓 계정 행에 있기 때문이다(ADR-0012).
 */
function accountFor(
  accounts: ReadonlyMap<string, ChannelAccountInfo>,
  mallKey: string,
): ChannelAccountInfo | null {
  return accounts.get(mallKey) ?? (mallKey === 'rocket' ? accounts.get('coupang-direct') ?? null : null);
}

function ChannelRow({
  row,
  account,
}: {
  row: ChannelTableRow;
  /** `undefined` 는 아직 못 받음, `null` 은 계정이 없음. */
  account: ChannelAccountInfo | null | undefined;
}) {
  const { channel, capabilities, notes, labels } = row;
  const logo = mallLogoPath(channel.mallKey);
  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal">
        <span className="flex items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
            <img
              src={logo}
              alt=""
              className="h-7 w-7 flex-none rounded-lg border border-slate-200 bg-white object-contain p-0.5"
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                'flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[10px] font-bold',
                mallAccentClass(channel.mallKey),
              )}
            >
              {mallMonogram(channel.mallName)}
            </span>
          )}
          <span className="truncate text-[13px] font-semibold text-slate-900">{channel.mallName}</span>
        </span>
      </th>
      <td className="max-w-[10rem] truncate px-2 py-2 text-slate-600" title={account?.loginId ?? undefined}>
        {account === undefined ? '…' : account?.loginId ?? '—'}
      </td>
      <td className="px-2 py-2 text-center">
        <UsageBadge account={account} />
      </td>
      <td className="px-2 py-2 text-center">
        <Link
          href="/mall-settings"
          aria-label={`${channel.mallName} 계정 설정`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Settings size={14} aria-hidden />
        </Link>
      </td>
      <td
        className="px-2 py-2 text-right tabular-nums text-slate-700"
        title={channel.imported
          ? `리스팅 ${formatNumber(channel.listingCount)}개 · 주문 ${formatNumber(channel.orderCount)}건`
          : '이 몰의 상품을 아직 가져오지 않았습니다 — 0 이 아니라 모릅니다.'}
      >
        {channel.imported ? formatNumber(channel.productCount) : <span className="text-slate-300">—</span>}
      </td>
      <MatchRateCell channel={channel} />
      {CAPABILITY_KEYS.map((key) => (
        <td key={key} className="px-1.5 py-2 text-center">
          <CapabilityCell kind={key} state={capabilities[key]} note={notes?.[key]} label={labels?.[key]} />
        </td>
      ))}
    </tr>
  );
}

/**
 * 매칭률 — 그 몰의 옵션 가운데 셀피아 재고에 이어진 비율.
 *
 * 이어져야 품절 판정 · 재고 차감이 된다. 가져오지 않은 몰은 0%가 아니라 `—` 다(모른다).
 * 옵션이 0개인 몰도 `—` — 나눌 것이 없는데 0% 라고 적으면 못 이은 것처럼 보인다.
 */
function MatchRateCell({ channel }: { channel: MallChannelSummary }) {
  const { optionCount, matchedOptionCount } = channel;
  if (!channel.imported || optionCount === 0) {
    return <td className="px-2 py-2 text-right"><span className="text-slate-300">—</span></td>;
  }
  const rate = Math.round((matchedOptionCount / optionCount) * 100);
  return (
    <td
      className="px-2 py-2 text-right tabular-nums"
      title={`옵션 ${formatNumber(optionCount)}개 중 ${formatNumber(matchedOptionCount)}개가 셀피아 재고에 이어졌습니다.`}
    >
      <span className={cn('font-semibold', rate >= 70 ? 'text-emerald-700' : rate >= 30 ? 'text-amber-700' : 'text-slate-500')}>
        {rate}%
      </span>
      <span className="ml-1 text-[11px] text-slate-400">
        {formatNumber(matchedOptionCount)}/{formatNumber(optionCount)}
      </span>
    </td>
  );
}

/** 쇼핑몰 계정 화면의 사용여부. 계정이 없으면 없다고 적는다 — '미사용' 과 다른 말이다. */
function UsageBadge({ account }: { account: ChannelAccountInfo | null | undefined }) {
  if (account === undefined) return <span className="text-slate-300">…</span>;
  if (account === null) return <span className="text-slate-400">계정 없음</span>;
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        account.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {account.enabled ? '사용' : '미사용'}
    </span>
  );
}

/**
 * 칸 머리 — 일 이름과, 연결된 몰 중 몇 곳에서 되는지. 막대는 됨 · 아직 · 불가 몫으로 나뉘고
 * 칸 사이는 2px 틈이다. 막대만 보고 읽게 하지 않는다 — 숫자가 함께 선다.
 */
function CapabilityHeader({
  kind,
  counts,
}: {
  kind: CapabilityKey;
  counts: CapabilityTotals[CapabilityKey];
}) {
  const Icon = CAPABILITY_ICON[kind];
  const label = CAPABILITY_LABEL[kind];
  const total = counts.ready + counts.pending + counts.unavailable;
  const summary = [
    `${label} ${formatNumber(total)}곳 중 ${formatNumber(counts.ready)}곳 됨`,
    `${formatNumber(counts.pending)}곳 아직`,
    ...(counts.unavailable > 0 ? [`${formatNumber(counts.unavailable)}곳 불가`] : []),
  ].join(', ');
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Icon size={12} aria-hidden />
        {label}
      </span>
      <span className="tabular-nums text-[11px] font-normal text-slate-400">
        <span className="font-semibold text-slate-700">{formatNumber(counts.ready)}</span> / {formatNumber(total)}
      </span>
      <span role="img" aria-label={summary} className="flex h-1.5 w-14 gap-0.5">
        {CAPABILITY_STATES.filter((state) => counts[state] > 0).map((state) => (
          <span
            key={state}
            title={`${STATE_WORD[state]} ${formatNumber(counts[state])}곳`}
            className={cn('h-full basis-0 first:rounded-l-full last:rounded-r-full', STATE_FILL[state])}
            style={{ flexGrow: counts[state] }}
          />
        ))}
      </span>
    </span>
  );
}
