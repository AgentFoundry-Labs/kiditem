'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { DiagnosisCard } from './components/DiagnosisCard';
import { MetricCard } from './components/MetricCard';

interface ComparisonItem {
  metric: string;
  label: string;
  myValue: number;
  industryAvg: number;
  industryGood: number;
  industryExcellent: number;
  industryPoor: number;
  status: string;
  gap: number;
  gapPercent: number;
  strategy: string;
  actions: string[];
}

interface BenchmarkResponse {
  comparisons: ComparisonItem[];
  diagnosis: {
    overallGrade: string;
    overallMessage: string;
    statusCounts: Record<string, number>;
    priorityImprovements: Array<{ metric: string; label: string; gap: number; strategy: string }>;
    strengths: Array<{ metric: string; label: string; status: string }>;
  };
  dataInfo: {
    period: string;
    adRecords: number;
    totalSpend: number;
    totalAdRevenue: number;
    totalRevenue: number;
  };
}

export default function AdsBenchmarkPage() {
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.benchmark(),
    queryFn: () => apiClient.get<BenchmarkResponse>('/api/ads/benchmark'),
  });

  if (isLoading) return <PageSkeleton variant="table" />;

  if (!data || data.comparisons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500">
        <p className="text-sm">광고 데이터가 없어 벤치마크 분석을 할 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">업계 평균 대비 진단</h1>

      {/* Diagnosis */}
      <DiagnosisCard diagnosis={data.diagnosis} dataInfo={data.dataInfo} />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {data.comparisons.map((c) => (
          <MetricCard
            key={c.metric}
            comparison={c}
            isExpanded={expandedMetric === c.metric}
            onToggle={() => setExpandedMetric(expandedMetric === c.metric ? null : c.metric)}
          />
        ))}
      </div>
    </div>
  );
}
