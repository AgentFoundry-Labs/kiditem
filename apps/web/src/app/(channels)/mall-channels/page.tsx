'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Settings, Share2 } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';
import { MallAccountSettingsDialog } from '../../(orders)/mall-settings/components/MallAccountSettingsDialog';
import { MALL_ACCOUNT_SETTINGS_PARAM, mallAccountKeyFor } from '../_shared/mall-account-settings-link';
import { SabangnetListingsImport } from '../_shared/SabangnetListingsImport';
import { isMallAdminListingMallKey } from '@kiditem/shared/mall-admin-listings';
import { MallAdminListingsImport } from '../_shared/MallAdminListingsImport';
import { CoupangCatalogEdit } from '../_shared/CoupangCatalogEdit';
import { CoupangWingExcelImport } from '../_shared/CoupangWingExcelImport';
import { useMallCapabilityRows } from '../_shared/use-mall-capability-rows';
import { SellpiaDashboard } from './components/SellpiaDashboard';
import { ChannelTable, type ChannelAccountInfo } from './components/ChannelTable';
import { CapabilityLegend } from './components/CapabilityPill';

/**
 * 쇼핑몰 현황.
 *
 * "지금 어디에 연결돼 있고, 각 몰로 무엇이 되는가" 한 화면. 쇼핑몰 계정 편집은 따로 된 화면이 아니라
 * 여기의 설정 창이다(사장님 2026-09-19 "쇼핑몰계정 페이지를 쇼핑몰 현황으로 넣어서 합쳐줘라 … 모달로"). 줄의
 * 설정은 그 몰, 머리의 계정 설정은 모든 몰의 계정 표를 연다. 편집 부품과 저장 API 는 계정 행의 작성자인 주문수집
 * 쪽(`app/(orders)/mall-settings`)에 그대로 있고 이 화면은 열기만 한다. 주소의 `?account=몰키|all` 이 그 창을 연다.
 *
 * 맨 위는 셀피아 영역(사장님 2026-09-19), 그 아래는 연동된 쇼핑몰 **한 표**다(사방넷 스케줄러와 같은 모양,
 * 사장님 2026-09-17). 줄마다 쇼핑몰 · 쇼핑몰 ID · 사용여부 · 설정과 되는 일 열 칸을 적고
 * **다 되는 몰부터** 둔다. 칸 머리에 몇 곳에서 되는지가 선다 — 초록 됨 · 회색 아직 · 빨강 불가.
 * 판정은 쇼핑몰 홈과 같은 곳(`useMallCapabilityRows`)에서 읽는다. 쇼핑몰 ID · 사용여부는
 * 쇼핑몰 계정의 값을 읽기만 한다(바꾸는 것은 설정 창).
 *
 * '등록 상품' 칸은 몰에 올라간 상품을 가져와야 채워진다. 몰 관리자에서 가져오는 몰은 그 몰 줄에서, 사방넷을
 * 쓰던 몰은 표 아래 '사방넷에서 가져오기'가 사방넷 송신 기록으로 한꺼번에 채운다(KID-246). 머리에는 계정
 * 설정만 둔다(사장님 2026-09-19 "상단에 잇는것들 … 버튼을 몰 옆에다가 정리해놔").
 *
 * 몰을 새로 만드는 기능은 없다. 몰 목록은 서버가 가진 고정 카탈로그이고, '연결'은
 * 그 중 하나에 계정을 채우는 일이다. 그래서 여기에 '채널 추가' 버튼을 두지 않고
 * 계정 설정 창을 연다 — 누르면 아무 일도 안 일어나는 버튼보다 낫다.
 */
export default function MallChannelsPage() {
  const { overviewQuery, overview, rows, totals } = useMallCapabilityRows();
  const router = useRouter();
  const searchParams = useSearchParams();
  const settingsTarget = searchParams.get(MALL_ACCOUNT_SETTINGS_PARAM);
  // 창을 여닫는 것은 주소다 — 쇼핑몰 홈 알림 같은 다른 화면의 링크도 같은 창을 연다.
  const openSettings = useCallback((target: string) => {
    router.replace(`/mall-channels?${MALL_ACCOUNT_SETTINGS_PARAM}=${encodeURIComponent(target)}`, { scroll: false });
  }, [router]);
  const closeSettings = useCallback(() => {
    router.replace('/mall-channels', { scroll: false });
  }, [router]);
  const accountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: () => orderMallAccountApi.list(),
  });
  const accounts = useMemo((): ReadonlyMap<string, ChannelAccountInfo> | null => {
    if (!Array.isArray(accountsQuery.data)) return accountsQuery.isError ? new Map() : null;
    return new Map(accountsQuery.data.map((account) => [
      account.key,
      { loginId: account.loginId ?? null, enabled: account.enabled, siteUrl: account.siteUrl ?? null },
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
        <button
          type="button"
          onClick={() => openSettings('all')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Settings size={14} />
          계정 설정
        </button>
      </div>

      <SellpiaDashboard />

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
          {rows.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="section-title">
                  연동된 쇼핑몰
                  <span className="ml-2 text-sm font-semibold tabular-nums text-slate-400">
                    {formatNumber(overview.shop.connectedChannelCount)}곳
                  </span>
                </h2>
                <CapabilityLegend />
              </div>
              <ChannelTable
                rows={rows}
                totals={totals}
                accounts={accounts}
                onOpenSettings={openSettings}
                // 몰을 늘리는 일은 읽기기 하나와 몰 표 한 줄이다. 화면이 몰 이름을 다시 적으면
                // 읽기기를 붙여도 누를 자리가 없다(라이브 2026-09-18: 온채널 · 꼬망세).
                renderImport={(mallKey) => (isMallAdminListingMallKey(mallKey)
                  ? <MallAdminListingsImport mallKey={mallKey} layout="row" />
                  : null)}
              />
            </section>
          ) : (
            <div className="empty-state">연결된 몰이 없습니다.</div>
          )}
        </>
      )}

      <section
        aria-label="사방넷에서 가져오기"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">사방넷에서 가져오기</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            사방넷을 쓰는 몰의 등록 상품은 사방넷 송신 기록에서 한꺼번에 가져옵니다. 몰 관리자에서 가져오는 몰은 표의 그 몰
            줄에서 가져옵니다.
          </p>
        </div>
        <SabangnetListingsImport />
      </section>

      <CoupangWingExcelImport />

      <CoupangCatalogEdit />

      <MallAccountSettingsDialog
        target={settingsTarget}
        mallName={rows.find((row) => mallAccountKeyFor(row.channel.mallKey) === settingsTarget)?.channel.mallName}
        onClose={closeSettings}
      />
    </div>
  );
}
