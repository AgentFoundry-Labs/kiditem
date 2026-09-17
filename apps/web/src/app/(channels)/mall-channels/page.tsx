'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Settings, Share2 } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { orderMallAccountApi } from '../../(orders)/order-collection/lib/order-mall-account-api';
import { SabangnetListingsImport } from '../_shared/SabangnetListingsImport';
import { useMallCapabilityRows } from '../_shared/use-mall-capability-rows';
import { ChannelSummary } from './components/ChannelSummary';
import { ChannelTable, type ChannelAccountInfo } from './components/ChannelTable';
import { CapabilityLegend } from './components/CapabilityPill';

/**
 * 쇼핑몰 현황.
 *
 * "지금 어디에 연결돼 있고, 각 몰로 무엇이 되는가" 한 화면. 자격증명 편집은 여기가
 * 아니라 쇼핑몰 계정 화면이 소유한다 — 그 화면은 주문수집 도메인 것이라 옮기지 않는다.
 *
 * 맨 위는 활성 상품 · 연결된 몰, 그 아래는 연결된 몰 **한 표**다(사방넷 스케줄러와 같은 모양,
 * 사장님 2026-09-17). 줄마다 쇼핑몰 · 쇼핑몰 ID · 사용여부 · 설정과 되는 일 아홉 칸을 적고
 * **다 되는 몰부터** 둔다. 칸 머리에 몇 곳에서 되는지가 선다 — 초록 됨 · 회색 아직 · 빨강 불가.
 * 판정은 쇼핑몰 홈과 같은 곳(`useMallCapabilityRows`)에서 읽는다. 쇼핑몰 ID · 사용여부는
 * 쇼핑몰 계정 화면의 값을 읽기만 한다.
 *
 * '등록 상품' 칸은 몰에 올라간 상품을 가져와야 채워진다. 사방넷을 쓰던 몰은 머리의
 * '사방넷에서 가져오기'가 사방넷 송신 기록으로 한꺼번에 채운다(KID-246).
 *
 * 몰을 새로 만드는 기능은 없다. 몰 목록은 서버가 가진 고정 카탈로그이고, '연결'은
 * 그 중 하나에 계정을 채우는 일이다. 그래서 여기에 '채널 추가' 버튼을 두지 않고
 * 계정 화면으로 보낸다 — 누르면 아무 일도 안 일어나는 버튼보다 낫다.
 */
export default function MallChannelsPage() {
  const { overviewQuery, overview, rows, totals } = useMallCapabilityRows();
  const accountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: () => orderMallAccountApi.list(),
  });
  const accounts = useMemo((): ReadonlyMap<string, ChannelAccountInfo> | null => {
    if (!Array.isArray(accountsQuery.data)) return accountsQuery.isError ? new Map() : null;
    return new Map(accountsQuery.data.map((account) => [
      account.key,
      { loginId: account.loginId ?? null, enabled: account.enabled },
    ]));
  }, [accountsQuery.data, accountsQuery.isError]);

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SabangnetListingsImport />
          <Link
            href="/mall-settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings size={14} />
            계정 설정
          </Link>
        </div>
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
              <ChannelTable rows={rows} totals={totals} accounts={accounts} />
            </section>
          ) : (
            <div className="empty-state">연결된 몰이 없습니다.</div>
          )}
        </>
      )}
    </div>
  );
}
