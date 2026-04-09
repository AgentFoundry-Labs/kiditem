'use client';

import {
  ImageIcon,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { ThumbnailListItem } from '@kiditem/shared';

const BADGE_COLORS: Record<string, string> = {
  S: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  A: 'bg-blue-100 text-blue-700 border-blue-200',
  B: 'bg-slate-100 text-slate-700 border-slate-200',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  F: 'bg-red-100 text-red-700 border-red-200',
};

interface Props {
  item: ThumbnailListItem;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ThumbnailCard({ item, isExpanded, onToggle }: Props) {
  return (
    <div className="table-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-14 h-14 rounded-lg bg-slate-50 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {item.imageUrl && item.imageUrl.startsWith('http') ? (
            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-slate-200" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-900 truncate block">
            {item.productName}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            {item.issues
              .filter((i) => i.severity === 'critical')
              .slice(0, 2)
              .map((issue, idx) => (
                <span
                  key={idx}
                  className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded"
                >
                  {issue.message.length > 30 ? `${issue.message.slice(0, 30)}...` : issue.message}
                </span>
              ))}
            {item.issues.filter((i) => i.severity === 'warning').length > 0 && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                경고 {item.issues.filter((i) => i.severity === 'warning').length}건
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
          <span className="font-mono tabular-nums">CTR {item.ctr.toFixed(2)}%</span>
          {item.prevCtr > 0 && (
            <span className="font-mono tabular-nums text-[10px]">
              {item.ctr >= item.prevCtr ? (
                <span className="text-green-600">▲ {(item.ctr - item.prevCtr).toFixed(2)}%</span>
              ) : (
                <span className="text-red-500">▼ {(item.prevCtr - item.ctr).toFixed(2)}%</span>
              )}
              <span className="text-slate-400 ml-1">(이전 {item.prevCtr.toFixed(2)}%)</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border', BADGE_COLORS[item.grade])}>
            <span className="text-lg font-black">{item.grade}</span>
          </div>
          {isExpanded ? (
            <ChevronUp size={14} className="text-slate-400" />
          ) : (
            <ChevronDown size={14} className="text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50/30 space-y-3">
          {item.issues.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mb-1.5">
                발견된 이슈
              </div>
              <div className="space-y-1">
                {item.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-start gap-2 p-2 rounded-lg text-xs',
                      issue.severity === 'critical'
                        ? 'bg-red-50 text-red-800'
                        : issue.severity === 'warning'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-blue-50 text-blue-800',
                    )}
                  >
                    {issue.severity === 'critical' ? (
                      <XCircle size={13} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    )}
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.suggestions.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mb-1.5">
                개선 제안
              </div>
              <div className="space-y-1">
                {item.suggestions.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs"
                  >
                    <Lightbulb size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="text-xs">
              <span className="text-slate-500">노출수</span>
              <span className="ml-2 font-medium text-slate-900">{formatNumber(item.impressions)}</span>
            </div>
            <div className="text-xs">
              <span className="text-slate-500">클릭수</span>
              <span className="ml-2 font-medium text-slate-900">{formatNumber(item.clicks)}</span>
            </div>
            <div className="text-xs">
              <span className="text-slate-500">전략</span>
              <span className="ml-2 font-medium text-slate-900">{item.strategy === 'premium' ? '프리미엄' : '표준'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
