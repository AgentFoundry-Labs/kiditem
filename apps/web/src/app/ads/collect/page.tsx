'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Database, Calendar, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';

interface CollectStatus {
  lastCollectedAt: string | null;
  campaignSnapshotCount: number;
  productSnapshotCount: number;
}

export default function AdsCollectPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.ads.collectStatus(),
    queryFn: () => apiClient.get<CollectStatus>('/api/ads/collect/status'),
  });

  const collectMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ status: string; message: string }>('/api/ads/collect'),
    onSuccess: (data) => {
      if (data.status === 'not_implemented') {
        toast.error(data.message);
      } else {
        toast.success('데이터 수집이 시작되었습니다.');
        queryClient.invalidateQueries({ queryKey: queryKeys.ads.collectStatus() });
      }
    },
    onError: () => toast.error('수집 요청에 실패했습니다.'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">데이터 수집</h1>
        <button
          onClick={() => collectMutation.mutate()}
          disabled={collectMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {collectMutation.isPending ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {collectMutation.isPending ? '수집 중...' : '수집 시작'}
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Calendar size={16} />
            마지막 수집
          </div>
          <div className="text-lg font-bold text-slate-900">
            {status?.lastCollectedAt
              ? new Date(status.lastCollectedAt).toLocaleString('ko-KR')
              : '기록 없음'}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Database size={16} />
            캠페인 스냅샷
          </div>
          <div className="text-lg font-bold text-slate-900">
            {(status?.campaignSnapshotCount ?? 0).toLocaleString()}건
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Database size={16} />
            상품 스냅샷
          </div>
          <div className="text-lg font-bold text-slate-900">
            {(status?.productSnapshotCount ?? 0).toLocaleString()}건
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <h4 className="font-semibold text-sm text-blue-800 mb-2">수집 안내</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>- 쿠팡 광고센터의 캠페인 및 상품별 광고 성과 데이터를 수집합니다.</li>
          <li>- 수집된 데이터는 캠페인 분석, 전략 수립, 벤치마크 비교에 활용됩니다.</li>
          <li>- 수집은 일 1회 자동 실행되며, 수동으로도 실행할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
