import Link from 'next/link';
import { Activity, RefreshCcw } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

export interface HealthSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  notEvaluated: number;
  lastEvaluatedAt: string | null;
  topCritical: Array<{
    id: string;
    name: string;
    healthScore: number | null;
    abcGrade: string | null;
  }>;
}

interface HealthSummaryCardProps {
  healthSummary: HealthSummary | null;
  healthLoading: boolean;
  evaluating: boolean;
  onEvaluate: () => void;
}

export default function HealthSummaryCard({ healthSummary, healthLoading, evaluating, onEvaluate }: HealthSummaryCardProps) {
  if (healthLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!healthSummary) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-center py-4">
          <p className="text-sm text-gray-400 mb-3">평가 데이터 없음</p>
          <button
            onClick={onEvaluate}
            disabled={evaluating}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {evaluating ? '평가 중...' : '지금 평가하기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-gray-500" />
          <h3 className="text-base font-semibold text-gray-900">상품 진단 현황</h3>
        </div>
        <div className="flex items-center gap-3">
          {healthSummary.lastEvaluatedAt && (
            <span className="text-xs text-gray-400">{timeAgo(healthSummary.lastEvaluatedAt)} 평가</span>
          )}
          <button
            onClick={onEvaluate}
            disabled={evaluating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={12} className={evaluating ? 'animate-spin' : ''} />
            {evaluating ? '평가 중...' : '전체 평가'}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm text-gray-700">정상 <strong className="text-green-700">{healthSummary.healthy}</strong>개</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="text-sm text-gray-700">주의 <strong className="text-amber-700">{healthSummary.warning}</strong>개</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm text-gray-700">위험 <strong className="text-red-700">{healthSummary.critical}</strong>개</span>
        </div>
      </div>
      {healthSummary.total > 0 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex mb-4">
          <div className="bg-green-500 h-full" style={{ width: `${(healthSummary.healthy / healthSummary.total) * 100}%` }} />
          <div className="bg-amber-500 h-full" style={{ width: `${(healthSummary.warning / healthSummary.total) * 100}%` }} />
          <div className="bg-red-500 h-full" style={{ width: `${(healthSummary.critical / healthSummary.total) * 100}%` }} />
        </div>
      )}
      {healthSummary.topCritical && healthSummary.topCritical.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-400 mb-2">위험 상품 TOP {healthSummary.topCritical.length}</p>
          <div className="space-y-2">
            {healthSummary.topCritical.slice(0, 5).map((item) => (
               <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-medium',
                    (item.healthScore ?? 0) < 40 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  )}>{item.healthScore ?? 0}</span>
                  <span className="text-sm text-gray-700 truncate">{item.name}</span>
                  {item.abcGrade && (
                    <span className="text-xs text-gray-400">{item.abcGrade}등급</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/products/${item.id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    상세
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
