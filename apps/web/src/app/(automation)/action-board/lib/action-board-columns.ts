import { formatTime } from '@/lib/utils';
import type { ActionTask } from '@kiditem/shared/action-task';

export type ViewMode = 'status' | 'role' | 'priority';
export type Scope = 'me' | 'team' | 'all';

export const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'status', label: '상태별' },
  { key: 'role', label: '역할별' },
  { key: 'priority', label: '우선순위별' },
];

export const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'me', label: '내 것' },
  { key: 'team', label: '팀' },
];

export const STATUS_COLS = [
  { key: 'pending', label: '대기', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
  { key: 'active', label: '진행 중', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  { key: 'done', label: '완료', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
];

export const ROLE_COLS = [
  { key: 'ad', label: '광고', dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  { key: 'inventory', label: '재고/소싱', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'finance', label: '재무/분석', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  { key: 'data', label: '데이터', dot: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700' },
];

export const PRIORITY_COLS = [
  { key: 'urgent', label: '긴급', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  { key: 'high', label: '높음', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'medium', label: '보통', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
];

export const STATUS_OPTIONS = [
  { value: 'pending', label: '대기', color: 'bg-slate-100 text-slate-600' },
  { value: 'active', label: '진행중', color: 'bg-blue-100 text-blue-700' },
  { value: 'done', label: '완료', color: 'bg-emerald-100 text-emerald-700' },
];

export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '긴급', color: 'bg-red-100 text-red-700' },
  { value: 'high', label: '높음', color: 'bg-amber-100 text-amber-700' },
  { value: 'medium', label: '보통', color: 'bg-blue-100 text-blue-700' },
];

export const ROLE_LABELS: Record<string, string> = {
  ad: '광고',
  inventory: '재고/소싱',
  finance: '재무/분석',
  data: '데이터',
};

export function getActionTaskRole(taskKey: string): string {
  if (/ad|roas|campaign/.test(taskKey)) return 'ad';
  if (/stock|inventory|mapping/.test(taskKey)) return 'inventory';
  if (/profit|category|grade|deficit|price/.test(taskKey)) return 'finance';
  if (/sync|scrape|ctr|csv|thumbnail|review/.test(taskKey)) return 'data';
  return 'ad';
}

export function getActionTaskColumnKey(task: ActionTask, viewMode: ViewMode): string {
  if (viewMode === 'status') return task.status;
  if (viewMode === 'role') return task.role || getActionTaskRole(task.taskKey);
  return task.priority;
}

export function getActionBoardColumns(viewMode: ViewMode) {
  if (viewMode === 'status') return STATUS_COLS;
  if (viewMode === 'role') return ROLE_COLS;
  return PRIORITY_COLS;
}

export function formatActionBoardTime(ts: string) {
  try {
    return formatTime(ts, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

export function severityBgColor(severity: string): string {
  switch (severity) {
    case 'info':
      return 'bg-blue-100 text-blue-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    case 'error':
      return 'bg-red-100 text-red-700';
    case 'critical':
      return 'bg-red-200 text-red-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
