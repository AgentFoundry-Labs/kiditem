'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Settings, Share2 } from 'lucide-react';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { mallPublishingApi } from '../_shared/mall-publishing-api';
import { ChannelHubBand } from './components/ChannelHubBand';
import { ChannelCard } from './components/ChannelCard';
import { MallRegisterBoard } from './components/MallRegisterBoard';

/**
 * 쇼핑몰 현황.
 *
 * "지금 어디에 연결돼 있고, 각 몰에서 얼마나 돌아가는가" 한 화면. 자격증명 편집은
 * 여기가 아니라 쇼핑몰 계정 화면이 소유한다 — 그 화면은 주문수집 도메인 것이라
 * 옮기지 않는다.
 *
 * 몰을 새로 만드는 기능은 없다. 몰 목록은 서버가 가진 고정 카탈로그이고, '연결'은
 * 그 중 하나에 계정을 채우는 일이다. 그래서 여기에 '채널 추가' 버튼을 두지 않고
 * 계정 화면으로 보낸다 — 누르면 아무 일도 안 일어나는 버튼보다 낫다.
 */
export default function MallChannelsPage() {
  const overviewQuery = useQuery({
    queryKey: queryKeys.mallPublishing.channelOverview(),
    queryFn: mallPublishingApi.channelOverview,
  });

  const overview = overviewQuery.data;

  const { active, idle } = useMemo(() => {
    const channels = overview?.channels ?? [];
    const isActive = (channel: MallChannelSummary) =>
      channel.listingCount > 0 || channel.orderCount > 0;
    return {
      active: channels.filter(isActive),
      idle: channels.filter((channel) => !isActive(channel)),
    };
  }, [overview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Share2 className="h-6 w-6 text-slate-600" />
            쇼핑몰 현황
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            연결된 몰과 각 몰에서 우리가 아는 만큼의 숫자입니다.
          </p>
        </div>
        <Link
          href="/mall-settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Settings size={14} />
          계정 설정
        </Link>
      </div>

      {overviewQuery.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
          <AlertCircle size={15} />
          {isApiError(overviewQuery.error)
            ? overviewQuery.error.detail
            : '몰 현황을 불러오지 못했습니다.'}
        </div>
      ) : overviewQuery.isLoading || !overview ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" />
          불러오는 중
        </div>
      ) : (
        <>
          <ChannelHubBand shop={overview.shop} />

          <MallRegisterBoard channels={overview.channels} />

          {active.length > 0 ? (
            <section className="space-y-3">
              <h2 className="section-title">
                거래가 있는 몰
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {formatNumber(active.length)}곳
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {active.map((channel) => (
                  <ChannelCard key={channel.mallKey} channel={channel} />
                ))}
              </div>
            </section>
          ) : null}

          {idle.length > 0 ? (
            <section className="space-y-3">
              <h2 className="section-title">
                연결만 된 몰
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {formatNumber(idle.length)}곳 · 리스팅도 주문도 아직 가져온 적 없음
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {idle.map((channel) => (
                  <ChannelCard key={channel.mallKey} channel={channel} />
                ))}
              </div>
            </section>
          ) : null}

          {overview.channels.length === 0 ? (
            <div className="empty-state">연결된 몰이 없습니다.</div>
          ) : null}
        </>
      )}
    </div>
  );
}
