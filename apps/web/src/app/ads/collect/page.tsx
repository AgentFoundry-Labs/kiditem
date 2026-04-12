'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Calendar, Wifi } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { formatDateTime, formatNumber } from '@/lib/utils';
import ScrapeCollector from './components/ScrapeCollector';

interface CollectStatus {
  lastCollectedAt: string | null;
  campaignSnapshotCount: number;
  productSnapshotCount: number;
}

interface ExtensionStatus {
  connected: boolean;
  productCount: number;
  snapshotCount: number;
  itemWinnerCount: number;
}

export default function AdsCollectPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.ads.collectStatus(),
    queryFn: () => apiClient.get<CollectStatus>('/api/ads/collect/status'),
  });

  const { data: extStatus } = useQuery({
    queryKey: queryKeys.ads.extensionStatus(),
    queryFn: () => apiClient.get<ExtensionStatus>('/api/ads/extension/status'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">데이터 수집</h1>
        <ScrapeCollector
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ads.collectStatus() });
            queryClient.invalidateQueries({ queryKey: queryKeys.ads.extensionStatus() });
          }}
        />
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 card-label mb-2">
            <Calendar size={16} />
            마지막 수집
          </div>
          <div className="text-lg font-bold text-slate-900">
            {status?.lastCollectedAt ? formatDateTime(status.lastCollectedAt) : '기록 없음'}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 card-label mb-2">
            <Database size={16} />
            캠페인 스냅샷
          </div>
          <div className="text-lg font-bold text-slate-900">
            {formatNumber(status?.campaignSnapshotCount ?? 0)}건
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 card-label mb-2">
            <Database size={16} />
            상품 스냅샷
          </div>
          <div className="text-lg font-bold text-slate-900">
            {formatNumber(status?.productSnapshotCount ?? 0)}건
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 card-label mb-2">
            <Wifi size={16} />
            익스텐션 상태
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${extStatus?.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-lg font-bold text-slate-900">
              {extStatus?.connected ? '연결됨' : '미연결'}
            </span>
          </div>
          {extStatus?.connected && (
            <div className="text-xs text-slate-400 mt-1">
              스냅샷 {extStatus.snapshotCount}건 / 위너 {extStatus.itemWinnerCount}건
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <h4 className="font-semibold text-sm text-blue-800 mb-2">수집 안내</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. 크롬 익스텐션 설치: <code className="bg-blue-100 px-1 rounded text-xs">extensions/coupang-ads-scraper/</code> 로드</li>
          <li>2. 익스텐션 팝업에서 &quot;대시보드 연동 등록&quot; 클릭</li>
          <li>3. 위의 &quot;정보 수집&quot; 버튼으로 광고센터 URL을 자동 스크래핑</li>
          <li>4. Wing/광고센터 페이지 방문 시 자동으로도 수집됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
