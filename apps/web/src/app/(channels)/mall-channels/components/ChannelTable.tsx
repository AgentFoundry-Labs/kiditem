'use client';

import { ExternalLink, Settings } from 'lucide-react';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { cn, formatNumber } from '@/lib/utils';
import { mallAccountKeyFor } from '../../_shared/mall-account-settings-link';
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

/** 쇼핑몰 계정(설정 창)에 저장된 그 몰의 계정. 없으면 `null`. */
export interface ChannelAccountInfo {
  loginId: string | null;
  enabled: boolean;
  /** 계정에 저장된 사이트 주소. 몰 칸을 누르면 여기로 간다. */
  siteUrl: string | null;
}

/**
 * 연결된 몰 표 — 사방넷 스케줄러와 같은 모양이다(사장님 2026-09-17).
 *
 * 한 줄이 몰 하나다. 쇼핑몰 · 쇼핑몰 ID · 사용여부 · 설정 · 등록 상품, 그리고 되는 일 열 칸.
 * 몰 칸을 누르면 계정에 저장된 사이트 주소가 새 탭으로 열린다(사장님 2026-09-19).
 * 등록 상품은 '판매중/전체'이고, 그 몰의 상품을 가져온 적이 없으면 0 이 아니라 `—` 다(모른다). 사방넷은
 * 칸마다 켜고 끄는 스위치를 두지만, 우리 칸은 **그 일이 지금 되는지**를 말한다 — 누를 수 없는
 * 스위치를 그리면 켜 둔 줄 알고 기다리게 된다. 켜고 끄는 것은 설정 창의 사용여부 하나다.
 *
 * 칸 머리에는 연결된 몰 중 몇 곳에서 되는지가 선다. 표가 넓어 가로로 밀리므로 몰 이름 칸은
 * 왼쪽에 붙어 있다.
 */
export function ChannelTable({
  rows,
  totals,
  accounts,
  onOpenSettings,
}: {
  rows: readonly ChannelTableRow[];
  totals: CapabilityTotals;
  /** 몰 키 → 쇼핑몰 계정. 아직 못 받았으면 `null`. */
  accounts: ReadonlyMap<string, ChannelAccountInfo> | null;
  /** 그 몰의 계정 설정 창을 연다. 인자는 쇼핑몰 계정 키다(쿠팡 로켓은 '쿠팡직배송'). */
  onOpenSettings: (accountKey: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1340px] border-collapse text-xs">
        <caption className="sr-only">연결된 몰마다 되는 일</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
            <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left">쇼핑몰</th>
            <th scope="col" className="px-2 py-2.5 text-left">쇼핑몰 ID</th>
            <th scope="col" className="px-2 py-2.5 text-center">사용여부</th>
            <th scope="col" className="px-2 py-2.5 text-center">설정</th>
            <th scope="col" className="px-2 py-2.5 text-right" title="판매중 상품 / 등록 상품">등록 상품<span className="ml-1 font-normal text-slate-400">판매중/전체</span></th>
            <th scope="col" className="px-2 py-2.5 text-right" title="판매중 옵션 기준">매칭률<span className="ml-1 font-normal text-slate-400">판매중</span></th>
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
              onOpenSettings={() => onOpenSettings(mallAccountKeyFor(row.channel.mallKey))}
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
  return accounts.get(mallKey) ?? accounts.get(mallAccountKeyFor(mallKey)) ?? null;
}

function ChannelRow({
  row,
  account,
  onOpenSettings,
}: {
  row: ChannelTableRow;
  /** `undefined` 는 아직 못 받음, `null` 은 계정이 없음. */
  account: ChannelAccountInfo | null | undefined;
  onOpenSettings: () => void;
}) {
  const { channel, capabilities, notes, labels } = row;
  const siteUrl = openableSiteUrl(account?.siteUrl);
  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <th scope="row" className="sticky left-0 z-10 bg-white p-0 text-left font-normal">
        {siteUrl ? (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${siteUrl} 열기`}
            className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
          >
            <MallIdentity channel={channel} />
            <ExternalLink size={12} aria-hidden className="flex-none text-slate-300 group-hover:text-slate-600" />
          </a>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2">
            <MallIdentity channel={channel} />
          </span>
        )}
      </th>
      <td className="max-w-[10rem] truncate px-2 py-2 text-slate-600" title={account?.loginId ?? undefined}>
        {account === undefined ? '…' : account?.loginId ?? '—'}
      </td>
      <td className="px-2 py-2 text-center">
        <UsageBadge account={account} />
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={`${channel.mallName} 계정 설정`}
          title="아이디 · 비밀번호 · 사이트 주소 · 로그인 테스트"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Settings size={14} aria-hidden />
        </button>
      </td>
      <td
        className="whitespace-nowrap px-2 py-2 text-right tabular-nums"
        title={channel.imported
          ? [
            `등록 상품 ${formatNumber(channel.productCount)}개 중 ${formatNumber(channel.onSaleProductCount)}개가 판매중입니다.`,
            `몰에 올라간 리스팅 ${formatNumber(channel.listingCount)}개 중 판매중 ${formatNumber(channel.onSaleListingCount)}개 · 주문 ${formatNumber(channel.orderCount)}건`,
          ].join('\n')
          : '이 몰의 상품을 아직 가져오지 않았습니다 — 0 이 아니라 모릅니다.'}
      >
        {channel.imported ? (
          <>
            <span className="font-semibold text-slate-800">{formatNumber(channel.onSaleProductCount)}</span>
            <span className="text-slate-400">/{formatNumber(channel.productCount)}</span>
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
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

/** 몰 로고(없으면 머리글자)와 이름. */
function MallIdentity({ channel }: { channel: MallChannelSummary }) {
  const logo = mallLogoPath(channel.mallKey);
  return (
    <>
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
    </>
  );
}

/** 링크로 열 수 있는 사이트 주소만 — 계정 칸은 사람이 적은 글이라 http(s) 가 아니면 걸지 않는다. */
function openableSiteUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * 매칭률 — **판매중** 옵션 가운데 셀피아 재고에 이어진 비율.
 *
 * 이어져야 품절 판정 · 재고 차감이 된다. 판매종료 · 보류 리스팅은 셀피아에 그 상품이 이미
 * 없어 영원히 이어지지 않으므로 분모에서 뺀다 — 섞어 세면 키드키즈가 19% 로 보이는데
 * 지금 손댈 수 있는 판매중만 보면 77% 다(사장님 2026-09-17). 전체 비율은 툴팁에 남긴다.
 *
 * 가져오지 않은 몰은 0%가 아니라 `—` 다(모른다). 판매중 옵션이 0개인 몰도 `—` — 나눌
 * 것이 없는데 0% 라고 적으면 못 이은 것처럼 보인다.
 */
function MatchRateCell({ channel }: { channel: MallChannelSummary }) {
  const { optionCount, matchedOptionCount, onSaleOptionCount, onSaleMatchedOptionCount } = channel;
  if (!channel.imported || onSaleOptionCount === 0) {
    return <td className="px-2 py-2 text-right"><span className="text-slate-300">—</span></td>;
  }
  const rate = Math.round((onSaleMatchedOptionCount / onSaleOptionCount) * 100);
  return (
    <td
      className="px-2 py-2 text-right tabular-nums"
      title={[
        `판매중 옵션 ${formatNumber(onSaleOptionCount)}개 중 ${formatNumber(onSaleMatchedOptionCount)}개가 셀피아 재고에 이어졌습니다.`,
        optionCount > 0
          ? `판매종료 · 보류까지 합치면 ${formatNumber(optionCount)}개 중 ${formatNumber(matchedOptionCount)}개입니다.`
          : null,
      ].filter(Boolean).join('\n')}
    >
      <span className={cn('font-semibold', rate >= 70 ? 'text-emerald-700' : rate >= 30 ? 'text-amber-700' : 'text-slate-500')}>
        {rate}%
      </span>
      <span className="ml-1 text-[11px] text-slate-400">
        {formatNumber(onSaleMatchedOptionCount)}/{formatNumber(onSaleOptionCount)}
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
