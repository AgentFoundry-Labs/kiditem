'use client';

import { MALL_PUBLISH_ADAPTERS } from '@/app/(channels)/_shared/adapters';
import { formatNumber } from '@/lib/utils';
import { channelDisplayName } from './RegisteredListingCard';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import type { RegisteredMarketCount } from '../lib/channel-listings-api';

/**
 * 마켓별 등록한 상품 수.
 *
 * 카드 목록을 **어댑터 레지스트리에서 만든다.** 예전에는 다섯 채널이 코드에 박혀 있어
 * 우리가 실제로 등록하는 몰(키즈노트·도매꾹·온채널·아트공구·올웨이즈·티처몰)이 하나도
 * 안 보이고, 쓰지도 않는 스마트스토어·ESM Plus 가 빈 칸으로 자리만 차지했다.
 * 몰을 늘리면 이 대시보드에도 저절로 나타나야 한다.
 *
 * ⭐ **모르는 자리에 0 을 찍지 않는다.** 리스팅을 한 번도 가져오지 않은 몰의 0 은
 * "그 몰에 없다"가 아니라 "우리가 모른다"다(`(channels)/AGENTS.md`). 가져온 적이 있으면
 * `0` 을, 없으면 `-` 와 `미확인` 을 보여 준다.
 */

export interface MarketplaceSummaryBarProps {
  counts: RegisteredMarketCount[];
  /** 몰별 요약. `imported` 로 진짜 0 과 모름을 가른다. 없으면 전부 모름으로 둔다. */
  channels?: readonly MallChannelSummary[];
  activeChannel: string | null;
  onSelectChannel: (channel: string | null) => void;
}

interface SummaryCard {
  channel: string;
  label: string;
  count: number;
  /** 그 몰의 리스팅을 가져온 적이 있는가. 0 의 뜻이 여기서 갈린다. */
  imported: boolean;
}

/** 대시보드에 세울 카드. 레지스트리가 먼저, 그 밖의 실데이터 채널이 뒤에 붙는다. */
export function marketplaceSummaryCards(
  counts: readonly RegisteredMarketCount[],
  channels: readonly MallChannelSummary[] = [],
): SummaryCard[] {
  const totals = new Map<string, number>();
  for (const item of counts) {
    totals.set(item.channel, (totals.get(item.channel) ?? 0) + item.count);
  }
  const importedByKey = new Map(channels.map((row) => [row.mallKey, row.imported]));
  const card = (channel: string, label: string): SummaryCard => ({
    channel,
    label,
    count: totals.get(channel) ?? 0,
    // 숫자가 있으면 그 자체가 가져온 증거다.
    imported: (totals.get(channel) ?? 0) > 0 || (importedByKey.get(channel) ?? false),
  });

  const fromRegistry = MALL_PUBLISH_ADAPTERS.map((adapter) =>
    card(adapter.mallKey, adapter.mallName));
  const known = new Set(fromRegistry.map((item) => item.channel));
  // 레지스트리에 없는데 실제로 등록된 채널(쿠팡 로켓 등). 데이터가 있으니 숨기지 않는다.
  const extras = [...totals.keys()]
    .filter((channel) => !known.has(channel))
    .sort()
    .map((channel) => card(channel, channelDisplayName(channel)));

  return [...fromRegistry, ...extras];
}

export function MarketplaceSummaryBar({
  counts,
  channels = [],
  activeChannel,
  onSelectChannel,
}: MarketplaceSummaryBarProps) {
  const cards = marketplaceSummaryCards(counts, channels);
  const total = cards.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="border-b border-slate-200 px-5 py-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-900">마켓별 등록한 상품 수</h2>
        <span className="text-xs font-bold text-slate-400">
          합계 {formatNumber(total)}개
        </span>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const selected = activeChannel === card.channel;
          return (
            <button
              key={card.channel}
              type="button"
              aria-pressed={selected}
              aria-label={`${card.label} ${card.imported ? `${card.count}개` : '미확인'}`}
              onClick={() => onSelectChannel(selected ? null : card.channel)}
              className="min-h-[88px] border-b border-r border-slate-200 px-5 py-4 text-left transition-colors hover:bg-slate-50 aria-pressed:bg-emerald-50"
            >
              <div className="text-sm font-black text-slate-700">{card.label}</div>
              {card.count > 0 ? (
                <div className="mt-5 text-2xl font-black tabular-nums text-slate-950">
                  {formatNumber(card.count)}
                </div>
              ) : card.imported ? (
                <div className="mt-5 text-2xl font-black tabular-nums text-slate-400">0</div>
              ) : (
                <div className="mt-4">
                  <div className="text-2xl font-black tabular-nums text-slate-300">-</div>
                  <div className="text-[10px] font-bold text-slate-400">미확인</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
