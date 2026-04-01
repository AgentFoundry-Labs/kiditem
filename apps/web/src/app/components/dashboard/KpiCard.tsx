import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  icon: LucideIcon;
  bgColor: string;
  accentColor: string;
  subValue?: string;
  prevLabel?: string;
}

export default function KpiCard({ label, value, unit, icon: Icon, bgColor, accentColor, subValue, prevLabel }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border transition-all hover:shadow-md', bgColor)}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} style={{ color: accentColor }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight" style={{ color: accentColor }}>{value}</span>
          <span className="text-sm font-semibold" style={{ color: accentColor, opacity: 0.6 }}>{unit}</span>
        </div>
        {subValue && <div className="text-xs text-gray-500 mt-1.5">{subValue}</div>}
        {prevLabel && <div className="text-xs text-gray-400 mt-1">이전 {prevLabel}</div>}
      </div>
    </div>
  );
}
