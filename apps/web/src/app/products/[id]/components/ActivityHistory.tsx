'use client';

import {
  Activity,
  Play,
  CheckCircle2,
  Package,
  Box,
} from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import type { ActivityEvent } from '../page';

interface ActivityHistoryProps {
  activities: ActivityEvent[];
  onAction: (action: any) => void;
}

export default function ActivityHistory({ activities, onAction }: ActivityHistoryProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">분석 기록</h3>
      </div>
      {activities.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-400">워크플로우를 실행하면 분석 결과가 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((event) => (
            <div key={event.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-xs font-medium text-slate-600">
                    {timeAgo(event.createdAt)}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{event.source}</span>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-slate-800">{event.title}</p>

                {event.data?.steps && Array.isArray(event.data.steps) && event.data.steps.length > 0 && (
                  <div className="space-y-1">
                    {event.data.steps.map((step: any, si: number) => (
                      <div key={si} className="flex items-center gap-2 text-xs text-slate-500">
                        <CheckCircle2 size={10} className="text-green-400" />
                        <span>{step.label ?? step.workflow}</span>
                        {typeof step.count === 'number' && (
                          <span className="text-slate-400">
                            {step.count}건{typeof step.filteredOut === 'number' ? ` (제외 ${step.filteredOut}건)` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {event.data?.actions && Array.isArray(event.data.actions) && event.data.actions.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-xs text-slate-400 font-medium">추천 액션</p>
                    {event.data.actions.map((action: any, ai: number) => (
                      <button
                        key={ai}
                        onClick={() => onAction(action)}
                        className="w-full text-left flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-300"
                      >
                        <span className="flex-shrink-0 mt-0.5">
                          {action.type?.startsWith('workflow.') && <Play size={11} className="text-blue-500" />}
                          {action.type?.startsWith('product.') && <Package size={11} className="text-amber-500" />}
                          {action.type?.startsWith('inventory.') && <Box size={11} className="text-purple-500" />}
                          {action.type?.startsWith('alert.') && <Activity size={11} className="text-red-500" />}
                        </span>
                        <div>
                          <span className="font-medium">{action.label}</span>
                          {action.reason && (
                            <p className="text-slate-400 mt-0.5">{action.reason}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
