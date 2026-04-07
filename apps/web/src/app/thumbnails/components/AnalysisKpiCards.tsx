'use client';
import { Scan, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiMiniProps {
  icon: React.ElementType;
  color: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  bar?: number;
  alert?: boolean;
  onClick?: () => void;
}

function KpiMini({ icon: Icon, color, label, value, unit, sub, bar, alert, onClick }: KpiMiniProps) {
  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-4 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-shadow bg-white shadow-md',
        alert ? 'border' : 'border border-slate-200'
      )}
      style={alert ? { borderColor: `${color}33` } : undefined}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</span>
        <span className="text-sm font-semibold" style={{ color, opacity: 0.5 }}>{unit}</span>
      </div>
      <div className="text-[13px] mt-1 text-slate-400">{sub}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: `${color}18` }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(bar, 100)}%`, background: color }} />
        </div>
      )}
      {alert && (
        <div className="mt-2 text-[9px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ background: `${color}15`, color }}>즉시 조치</div>
      )}
    </div>
  );
}

interface AnalysisKpiCardsProps {
  classifiedPct: number;
  analyzedCount: number;
  unclassifiedCount: number;
  goodRate: number;
  goodCount: number;
  criticalCount: number;
  onTabChange: (tab: string) => void;
  onFilterChange: (filter: string) => void;
}

export function AnalysisKpiCards({
  classifiedPct,
  analyzedCount,
  unclassifiedCount,
  goodRate,
  goodCount,
  criticalCount,
  onTabChange,
  onFilterChange,
}: AnalysisKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiMini
        icon={Scan}
        color="#7c3aed"
        label="AI 분류율"
        value={classifiedPct}
        unit="%"
        sub={`${analyzedCount}개 분류 / ${unclassifiedCount}개 미분류`}
        bar={classifiedPct}
        onClick={() => { onTabChange('unclassified'); }}
      />
      <KpiMini
        icon={CheckCircle}
        color="#059669"
        label="우수 비율"
        value={goodRate}
        unit="%"
        sub={`S+A ${goodCount}개 / ${analyzedCount}개`}
        bar={goodRate}
        onClick={() => { onTabChange('all'); onFilterChange('all'); }}
      />
      <KpiMini
        icon={AlertTriangle}
        color="#dc2626"
        label="긴급 개선"
        value={criticalCount}
        unit="개"
        sub="크리티컬 이슈 상품"
        alert={criticalCount > 0}
        onClick={() => { onTabChange('all'); onFilterChange('critical'); }}
      />
      <KpiMini
        icon={XCircle}
        color="#d97706"
        label="미분류"
        value={unclassifiedCount}
        unit="개"
        sub="AI 스캔 대기 상품"
        alert={unclassifiedCount > 0}
        onClick={() => { onTabChange('unclassified'); }}
      />
    </div>
  );
}
