'use client';

import { BarChart3, CheckCircle, XCircle, Clock } from 'lucide-react';
import MetricCard from './MetricCard';
import { formatNumber } from '@/lib/utils';

interface Props {
  totalCount: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
}

export function LogMetrics({ totalCount, successCount, errorCount, avgDuration }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <MetricCard
        label="총 실행"
        value={formatNumber(totalCount)}
        color="text-blue-600"
        icon={<BarChart3 className="w-4 h-4" />}
      />
      <MetricCard
        label="성공"
        value={successCount}
        color="text-green-600"
        icon={<CheckCircle className="w-4 h-4" />}
      />
      <MetricCard
        label="오류"
        value={errorCount}
        color={errorCount > 0 ? 'text-red-400' : 'text-gray-500'}
        icon={<XCircle className="w-4 h-4" />}
      />
      <MetricCard
        label="평균 소요시간"
        value={`${avgDuration}초`}
        color="text-violet-400"
        icon={<Clock className="w-4 h-4" />}
      />
    </div>
  );
}
