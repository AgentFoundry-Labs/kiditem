'use client';

import Link from 'next/link';
import { AlertCircle, Loader2, Settings, Share2 } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { useMallCapabilityRows } from '../_shared/use-mall-capability-rows';
import { ChannelCard } from './components/ChannelCard';
import { ChannelSummary } from './components/ChannelSummary';
import { CapabilityLegend } from './components/CapabilityPill';

/**
 * 쇼핑몰 현황.
 *
 * "지금 어디에 연결돼 있고, 각 몰로 무엇이 되는가" 한 화면. 자격증명 편집은 여기가
 * 아니라 쇼핑몰 계정 화면이 소유한다 — 그 화면은 주문수집 도메인 것이라 옮기지 않는다.
 *
 * 맨 위는 요약 여섯 칸(활성 상품 · 연결된 몰 · 주문수집 · 송장전송 · 상품등록 · 품절관리),
 * 그 아래는 연결된 몰 **한 목록**이다. 카드마다 되는 일 넷과 숫자 셋을 같은 틀로 적고
 * **다 되는 몰부터** 둔다. 요약의 막대와 카드의 줄은 같은 색이다 — 초록 됨 · 회색 아직 ·
 * 빨강 불가. 판정은 쇼핑몰 홈과 같은 곳(`useMallCapabilityRows`)에서 읽는다.
 *
 * 몰을 새로 만드는 기능은 없다. 몰 목록은 서버가 가진 고정 카탈로그이고, '연결'은
 * 그 중 하나에 계정을 채우는 일이다. 그래서 여기에 '채널 추가' 버튼을 두지 않고
 * 계정 화면으로 보낸다 — 누르면 아무 일도 안 일어나는 버튼보다 낫다.
 */
export default function MallChannelsPage() {
  const { overviewQuery, overview, rows, totals } = useMallCapabilityRows();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Share2 className="h-6 w-6 text-slate-600" />
            쇼핑몰 현황
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            연결된 몰과 각 몰로 되는 일입니다.
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
          <ChannelSummary
            productCount={overview.shop.productCount}
            connectedCount={overview.shop.connectedChannelCount}
            totals={totals}
          />

          {rows.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="section-title">
                  연결된 몰
                  <span className="ml-2 text-xs font-normal text-slate-400">다 되는 몰부터</span>
                </h2>
                <CapabilityLegend />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {rows.map(({ channel, capabilities, notes }) => (
                  <ChannelCard
                    key={channel.mallKey}
                    channel={channel}
                    capabilities={capabilities}
                    notes={notes}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="empty-state">연결된 몰이 없습니다.</div>
          )}
        </>
      )}
    </div>
  );
}
