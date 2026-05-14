import { Download } from 'lucide-react';
import PeriodSelector from '@/components/ui/PeriodSelector';

type PeriodOption = {
  value: string;
  label: string;
};

type StatisticsToolbarProps = {
  period: string;
  periodOptions: PeriodOption[];
  onPeriodChange: (nextPeriod: string) => void;
};

export function StatisticsToolbar({
  period,
  periodOptions,
  onPeriodChange,
}: StatisticsToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="page-title">통합 통계</h1>
      <div className="flex items-center gap-2">
        <PeriodSelector value={period} onChange={onPeriodChange} options={periodOptions} />
        <button
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          type="button"
        >
          <Download size={12} /> 엑셀 다운로드
        </button>
      </div>
    </div>
  );
}
