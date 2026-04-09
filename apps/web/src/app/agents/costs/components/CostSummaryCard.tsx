import { cn } from '@/lib/utils';

interface CostSummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  iconBg: string;
}

export function CostSummaryCard({ icon, label, value, sub, iconBg }: CostSummaryCardProps) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
