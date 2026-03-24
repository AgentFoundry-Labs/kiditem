'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  color?: string;
  className?: string;
}

export default function MetricCard({
  label,
  value,
  subValue,
  icon,
  trend,
  color = 'text-gray-900',
  className,
}: MetricCardProps) {
  const TrendIcon = trend
    ? trend.value > 0
      ? TrendingUp
      : trend.value < 0
      ? TrendingDown
      : Minus
    : null;

  return (
    <div className={cn('bg-gray-50 rounded-xl p-4 border border-gray-200', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-gray-600">{icon}</span>}
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      <div className="flex items-center justify-between mt-1">
        {subValue && <span className="text-[10px] text-gray-600">{subValue}</span>}
        {trend && TrendIcon && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px]',
              trend.value > 0 ? 'text-green-600' : trend.value < 0 ? 'text-red-400' : 'text-gray-500'
            )}
          >
            <TrendIcon className="w-3 h-3" />
            {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
