'use client';
import { ScanSearch, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionCardProps {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  count: number;
  sub1: string;
  sub2: string;
  urgent?: boolean;
  onClick?: () => void;
}

function ActionCard({ icon: Icon, color, bgColor, borderColor, label, count, sub1, sub2, urgent, onClick }: ActionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-4 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all bg-white shadow-md border',
        urgent ? borderColor : 'border-slate-200'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={cn('flex items-center gap-1.5')}>
          <Icon size={15} style={{ color }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        </div>
        {urgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-extrabold tabular-nums" style={{ color }}>{count}</span>
        <span className="text-sm font-semibold text-slate-400">개</span>
      </div>
      <div className="mt-1 space-y-0.5">
        <div className="text-[12px] text-slate-400">{sub1}</div>
        <div className="text-[12px] text-slate-400">{sub2}</div>
      </div>
    </div>
  );
}

interface AnalysisKpiCardsProps {
  unclassifiedCount: number;
  unclassifiedWithImage: number;
  unclassifiedNoImage: number;
  analyzedCount: number;
  avgScore: number;
  goodRate: number;
  needsFixCount: number;
  complianceFailCount: number;
  complianceWarnCount: number;
  appliedCount: number;
  avgDaysTracked: number;
  onTabChange: (tab: string) => void;
}

export function AnalysisKpiCards({
  unclassifiedCount,
  unclassifiedWithImage,
  unclassifiedNoImage,
  analyzedCount,
  avgScore,
  goodRate,
  needsFixCount,
  complianceFailCount,
  complianceWarnCount,
  appliedCount,
  avgDaysTracked,
  onTabChange,
}: AnalysisKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ActionCard
        icon={ScanSearch}
        color="#6b7280"
        bgColor="rgba(107,114,128,0.06)"
        borderColor="border-gray-300"
        label="미분류"
        count={unclassifiedCount}
        sub1={`이미지 있음 ${unclassifiedWithImage}개`}
        sub2={`이미지 없음 ${unclassifiedNoImage}개`}
        urgent={unclassifiedCount > 0}
        onClick={() => onTabChange('unclassified')}
      />
      <ActionCard
        icon={Zap}
        color="#3182f6"
        bgColor="rgba(49,130,246,0.06)"
        borderColor="border-blue-200"
        label="AI 분류"
        count={analyzedCount}
        sub1={`평균 점수 ${avgScore}점`}
        sub2={`우수(S+A) ${goodRate}%`}
        onClick={() => onTabChange('all')}
      />
      <ActionCard
        icon={AlertTriangle}
        color="#f59e0b"
        bgColor="rgba(245,158,11,0.06)"
        borderColor="border-amber-300"
        label="개선 필요"
        count={needsFixCount}
        sub1={`가이드라인 FAIL ${complianceFailCount}개`}
        sub2={`가이드라인 WARN ${complianceWarnCount}개`}
        urgent={complianceFailCount > 0}
        onClick={() => onTabChange('needsfix')}
      />
      <ActionCard
        icon={TrendingUp}
        color="#0891b2"
        bgColor="rgba(8,145,178,0.06)"
        borderColor="border-cyan-200"
        label="추적"
        count={appliedCount}
        sub1={`적용 완료 상품`}
        sub2={avgDaysTracked > 0 ? `평균 ${avgDaysTracked}일 경과` : '추적 대기 중'}
        onClick={() => onTabChange('tracking')}
      />
    </div>
  );
}
