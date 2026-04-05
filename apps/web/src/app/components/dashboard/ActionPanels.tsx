import React from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Sparkles,
  Bell,
  Check,
  Play,
  ArrowUpRight,
  MinusCircle,
  AlertTriangle,
  Megaphone,
  DollarSign,
  Truck,
  ImageIcon,
  TrendingDown,
  PackageX,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

export interface HumanTask {
  id: string;
  label: string;
  detail: string;
  where: string;
  priority: 'urgent' | 'high' | 'medium';
  href?: string;
}

export interface AiAction {
  id: string;
  label: string;
  desc: string;
  priority: 'urgent' | 'high' | 'medium';
  apiCall?: { url: string; method: string; body?: Record<string, string> };
  href?: string;
}

interface DashboardAlertItem {
  id: string;
  type: string;
  title?: string;
  message: string;
  createdAt?: string;
}

interface ActionPanelsProps {
  humanTasks: HumanTask[];
  aiActions: AiAction[];
  alerts: DashboardAlertItem[];
  checkedTasks: Record<string, boolean>;
  completedActions: Record<string, boolean>;
  processingAction: string | null;
  onToggleTask: (id: string) => void;
  onExecuteAction: (action: AiAction) => void;
  onMarkActionCompleted: (id: string) => void;
}

const alertIcon = (type: string) => {
  const m: Record<string, React.ReactNode> = {
    minus_product: <MinusCircle size={13} className="text-red-500 shrink-0" />,
    profit_low: <AlertTriangle size={13} className="text-orange-500 shrink-0" />,
    ad_high: <Megaphone size={13} className="text-amber-500 shrink-0" />,
    ad_overspend: <DollarSign size={13} className="text-red-500 shrink-0" />,
    stock_low: <Truck size={13} className="text-blue-500 shrink-0" />,
    thumbnail_drop: <ImageIcon size={13} className="text-blue-500 shrink-0" />,
    grade_change: <TrendingDown size={13} className="text-orange-500 shrink-0" />,
    defect_found: <PackageX size={13} className="text-red-500 shrink-0" />,
  };
  return m[type] || <AlertTriangle size={13} className="text-gray-400 shrink-0" />;
};

export default function ActionPanels({
  humanTasks, aiActions, alerts, checkedTasks, completedActions,
  processingAction, onToggleTask, onExecuteAction, onMarkActionCompleted,
}: ActionPanelsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* 오늘 할 일 */}
      <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-orange-100/60 border-b border-orange-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <ClipboardList size={15} className="text-white" />
            </div>
            <h3 className="text-base font-semibold text-orange-900">오늘 할 일</h3>
            <span className="text-xs font-semibold text-orange-600 bg-orange-200 px-2 py-0.5 rounded-full">
              {humanTasks.filter(t => !checkedTasks[t.id]).length}건 남음
            </span>
          </div>
        </div>
        <div className="divide-y divide-orange-100/50 max-h-[400px] overflow-y-auto">
          {humanTasks.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">처리할 업무가 없습니다</div>
          )}
          {humanTasks.map(task => {
            const done = !!checkedTasks[task.id];
            const pStyle = task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
            const pLabel = task.priority === 'urgent' ? '긴급' : task.priority === 'high' ? '높음' : '보통';
            return (
              <div key={task.id} className={cn('flex items-start gap-3 px-4 py-3 hover:bg-white/50 transition-colors', done && 'opacity-40')}>
                <button onClick={() => onToggleTask(task.id)} className={cn('shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors', done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-orange-400')}>
                  {done && <Check size={12} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-semibold', pStyle)}>{pLabel}</span>
                    <span className={cn('text-sm font-semibold', done ? 'line-through text-gray-400' : 'text-gray-900')}>{task.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 leading-relaxed">{task.detail}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{task.where}</span>
                    {task.href && (
                      <Link href={task.href} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-medium hover:bg-blue-100 transition-colors">
                        상세 확인 →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI 자동 실행 */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-100/60 border-b border-blue-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <Sparkles size={15} className="text-white" />
            </div>
            <h3 className="text-base font-semibold text-blue-900">AI 자동 실행</h3>
            <span className="text-xs font-semibold text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">
              {aiActions.filter(a => !completedActions[a.id]).length}건
            </span>
          </div>
        </div>
        <div className="divide-y divide-blue-100/50 max-h-[400px] overflow-y-auto">
          {aiActions.filter(a => !completedActions[a.id]).length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">모든 자동 액션 완료</div>
          )}
          {aiActions.filter(a => !completedActions[a.id]).map(action => {
            const isProcessing = processingAction === action.id;
            const pStyle = action.priority === 'urgent' ? 'bg-red-100 text-red-700' : action.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
            const pLabel = action.priority === 'urgent' ? '긴급' : action.priority === 'high' ? '높음' : '보통';
            return (
              <div key={action.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors">
                <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-semibold', pStyle)}>{pLabel}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{action.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{action.desc}</div>
                </div>
                {action.href && !action.apiCall ? (
                  <Link
                    href={action.href}
                    onClick={() => onMarkActionCompleted(action.id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  >
                    <ArrowUpRight size={13} /> 확인
                  </Link>
                ) : (
                  <button
                    onClick={() => onExecuteAction(action)}
                    disabled={isProcessing}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                      isProcessing ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    )}
                  >
                    {isProcessing ? (
                      <><span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full" /> 처리중</>
                    ) : (
                      <><Play size={13} /> 실행</>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 알림 */}
      <div className="rounded-xl border-2 border-red-200 bg-red-50/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-red-100/60 border-b border-red-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
              <Bell size={15} className="text-white" />
            </div>
            <h3 className="text-base font-semibold text-red-900">알림</h3>
            <span className="text-xs font-semibold text-white bg-red-500 px-2 py-0.5 rounded-full">{alerts.length}</span>
          </div>
        </div>
        <div className="divide-y divide-red-100/50 max-h-[400px] overflow-y-auto">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-white/50 transition-colors">
              <div className="mt-0.5">{alertIcon(a.type)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-700 leading-relaxed">{a.title || a.message}</span>
                {a.title && a.message && !/^[a-z_]+\.[a-z_]+/.test(a.message) && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.message}</p>
                )}
              </div>
              {a.createdAt && (
                <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeAgo(a.createdAt)}</span>
              )}
            </div>
          ))}
          {alerts.length === 0 && <div className="px-4 py-8 text-center text-xs text-gray-400">알림 없음</div>}
        </div>
      </div>
    </div>
  );
}
