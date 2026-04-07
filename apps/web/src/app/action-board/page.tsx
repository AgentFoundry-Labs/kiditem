'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Sparkles, Play, Check, X,
  RefreshCw, ExternalLink, Loader2, ChevronDown,
  MessageSquare, Clock, Send, Package,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { ActionTask } from '@kiditem/shared';
import { parseActionResult, type ActionResult } from './lib/actions';

type ViewMode = 'status' | 'role' | 'priority';

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'status', label: '상태별' },
  { key: 'role', label: '역할별' },
  { key: 'priority', label: '우선순위별' },
];

const STATUS_COLS = [
  { key: 'pending', label: '대기', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
  { key: 'active', label: '진행 중', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  { key: 'done', label: '완료', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
];

const ROLE_COLS = [
  { key: 'ad', label: '광고', dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  { key: 'inventory', label: '재고/소싱', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'finance', label: '재무/분석', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  { key: 'data', label: '데이터', dot: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700' },
];

const PRIORITY_COLS = [
  { key: 'urgent', label: '긴급', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  { key: 'high', label: '높음', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'medium', label: '보통', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: '대기', color: 'bg-slate-100 text-slate-600' },
  { value: 'active', label: '진행중', color: 'bg-blue-100 text-blue-700' },
  { value: 'done', label: '완료', color: 'bg-emerald-100 text-emerald-700' },
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '긴급', color: 'bg-red-100 text-red-700' },
  { value: 'high', label: '높음', color: 'bg-amber-100 text-amber-700' },
  { value: 'medium', label: '보통', color: 'bg-blue-100 text-blue-700' },
];

const ROLE_LABELS: Record<string, string> = {
  ad: '광고', inventory: '재고/소싱', finance: '재무/분석', data: '데이터',
};

function getRole(taskKey: string): string {
  if (/ad|roas|campaign/.test(taskKey)) return 'ad';
  if (/stock|reorder|inventory/.test(taskKey)) return 'inventory';
  if (/profit|category|grade|deficit|price/.test(taskKey)) return 'finance';
  if (/sync|scrape|ctr|csv|thumbnail|review/.test(taskKey)) return 'data';
  return 'ad';
}

function formatLogTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

export default function ActionBoardPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('status');
  const [selectedTask, setSelectedTask] = useState<ActionTask | null>(null);
  const [noteText, setNoteText] = useState('');
  const [drawerResult, setDrawerResult] = useState<ActionResult[] | null>(null);

  // ── Data fetching ──
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: queryKeys.actionTasks.list(),
    queryFn: () => apiClient.get<ActionTask[]>('/api/action-tasks'),
    refetchInterval: 60_000,
  });

  // ── Mutations ──
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; priority?: string }) =>
      apiClient.patch<ActionTask>(`/api/action-tasks/${id}`, body),
    onSuccess: (updated) => {
      invalidate();
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiClient.post<ActionTask>(`/api/action-tasks/${id}/notes`, { text }),
    onSuccess: (updated) => {
      invalidate();
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
      setNoteText('');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ActionTask>(`/api/action-tasks/${id}/execute`),
    onSuccess: (updated) => {
      invalidate();
      if (selectedTask?.id === updated.id) {
        setSelectedTask(updated);
        if (updated.result) {
          setDrawerResult(parseActionResult(updated.taskKey, updated.result));
        }
      }
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.detail : err instanceof Error ? err.message : '실행 실패';
      setDrawerResult([{ label: '오류', value: msg, highlight: true }]);
    },
  });

  // ── Helpers ──
  function getColumnKey(task: ActionTask): string {
    if (viewMode === 'status') return task.status;
    if (viewMode === 'role') return task.role || getRole(task.taskKey);
    return task.priority;
  }

  function getColumns() {
    if (viewMode === 'status') return STATUS_COLS;
    if (viewMode === 'role') return ROLE_COLS;
    return PRIORITY_COLS;
  }

  function openDrawer(task: ActionTask) {
    setSelectedTask(task);
    setDrawerResult(null);
    setNoteText('');
    if (task.type === 'ai' && task.result) {
      setDrawerResult(parseActionResult(task.taskKey, task.result));
    }
  }

  const columns = getColumns();

  if (isLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-slate-600" />
          <h1 className="text-lg font-semibold text-slate-900">액션 보드</h1>
          <span className="text-xs text-slate-400 ml-1">{tasks.length}건</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-0.5" role="tablist">
            {VIEW_TABS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={viewMode === tab.key}
                onClick={() => setViewMode(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  viewMode === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => invalidate()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className={cn(
          'flex flex-col md:inline-grid md:grid-flow-col gap-0 divide-y md:divide-y-0 md:divide-x border rounded-xl overflow-hidden min-w-full',
        )} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
          {columns.map(col => {
            const colTasks = tasks.filter(t => getColumnKey(t) === col.key);
            return (
              <div key={col.key} className="flex flex-col min-h-0 bg-slate-50/50">
                <div className="px-4 py-3 border-b bg-white/80">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', col.dot)} />
                    <span className="text-sm font-medium text-slate-700">{col.label}</span>
                    <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-medium', col.badge)}>
                      {colTasks.length}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      role="button"
                      aria-label={task.label}
                      tabIndex={0}
                      onClick={() => openDrawer(task)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openDrawer(task);
                        if (e.key === 'Escape') setSelectedTask(null);
                      }}
                      className={cn(
                        'rounded-lg border p-3 shadow-sm cursor-pointer transition-all hover:shadow-md',
                        task.type === 'ai'
                          ? 'border-violet-200 bg-violet-50/30'
                          : 'border-slate-200 bg-white',
                        task.status === 'done' && 'opacity-60',
                        selectedTask?.id === task.id && 'ring-2 ring-blue-400',
                      )}
                    >
                      {task.type === 'human' ? (
                        <>
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={task.status === 'done'}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateMutation.mutate({
                                  id: task.id,
                                  status: task.status === 'done' ? 'pending' : 'done',
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 rounded border-slate-300"
                            />
                            <span className={cn(
                              'text-xs font-medium text-slate-800 leading-tight',
                              task.status === 'done' && 'line-through text-slate-400',
                            )}>
                              {task.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">{task.detail}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-slate-400">{task.where}</span>
                            {task.href && (
                              <Link
                                href={task.href}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-blue-500 hover:text-blue-700"
                              >
                                바로가기
                              </Link>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            {task.status === 'done'
                              ? <Check size={13} className="text-emerald-500" />
                              : <Sparkles size={13} className="text-violet-500" />
                            }
                            <span className="text-xs font-medium text-slate-800">{task.label}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-medium ml-auto">AI</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">{task.detail}</p>
                          {task.status !== 'done' && !executeMutation.isPending && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                executeMutation.mutate(task.id);
                                openDrawer(task);
                              }}
                              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800"
                            >
                              <Play size={11} /> 실행
                            </button>
                          )}
                          {executeMutation.isPending && executeMutation.variables === task.id && (
                            <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-500">
                              <Loader2 size={11} className="animate-spin" /> 실행 중...
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center text-[11px] text-slate-300 py-8">항목 없음</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drawer overlay */}
      {selectedTask && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSelectedTask(null)}
        />
      )}

      {/* Side drawer */}
      <div
        role="dialog"
        aria-label="상세 정보"
        onKeyDown={(e) => { if (e.key === 'Escape') setSelectedTask(null); }}
        className={cn(
          'fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl border-l border-slate-200 z-50',
          'transform transition-transform duration-300',
          selectedTask ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {selectedTask && (
          <div className="flex flex-col h-full">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                {selectedTask.type === 'ai'
                  ? <Sparkles size={16} className="text-violet-500" />
                  : <ClipboardList size={16} className="text-slate-500" />
                }
                <span className="text-sm font-semibold text-slate-900">
                  {selectedTask.type === 'ai' ? 'AI 액션' : '사람 작업'}
                </span>
                {selectedTask.type === 'ai' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 font-medium">AI</span>
                )}
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Status + Priority + Role */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status dropdown */}
                <div className="relative">
                  <select
                    value={selectedTask.status}
                    onChange={(e) => updateMutation.mutate({ id: selectedTask.id, status: e.target.value })}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-md font-medium border-0 appearance-none pr-5 cursor-pointer',
                      STATUS_OPTIONS.find(o => o.value === selectedTask.status)?.color ?? 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>

                {/* Priority dropdown */}
                <div className="relative">
                  <select
                    value={selectedTask.priority}
                    onChange={(e) => updateMutation.mutate({ id: selectedTask.id, priority: e.target.value })}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-md font-medium border-0 appearance-none pr-5 cursor-pointer',
                      PRIORITY_OPTIONS.find(o => o.value === selectedTask.priority)?.color ?? 'bg-blue-100 text-blue-700',
                    )}
                  >
                    {PRIORITY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>

                {/* Role tag */}
                {(selectedTask.role || getRole(selectedTask.taskKey)) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                    {ROLE_LABELS[selectedTask.role || getRole(selectedTask.taskKey)] ?? selectedTask.role}
                  </span>
                )}
              </div>

              {/* Title */}
              <div>
                <h3 className={cn(
                  'text-sm font-semibold text-slate-900',
                  selectedTask.status === 'done' && 'line-through text-slate-400',
                )}>
                  {selectedTask.label}
                </h3>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {selectedTask.detail}
                </p>
              </div>

              {/* Where + link (human) */}
              {selectedTask.type === 'human' && selectedTask.where && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400">
                    <span className="font-medium text-slate-500">위치:</span> {selectedTask.where}
                  </div>
                  {selectedTask.href && (
                    <Link
                      href={selectedTask.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800"
                    >
                      <ExternalLink size={12} /> 바로가기
                    </Link>
                  )}
                </div>
              )}

              {/* Related products */}
              {selectedTask.relatedProducts && selectedTask.relatedProducts.length > 0 && (
                <div className="border rounded-lg p-3 bg-slate-50/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-2">
                    <Package size={12} /> 관련 상품 ({selectedTask.relatedProducts.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedTask.relatedProducts.slice(0, 15).map((p) => (
                      <div key={p.id} className="flex justify-between text-[11px] gap-2">
                        <span className="text-slate-600 truncate">{p.name}</span>
                        <span className="text-slate-500 shrink-0">{p.metric} {p.value}</span>
                      </div>
                    ))}
                    {selectedTask.relatedProducts.length > 15 && (
                      <div className="text-[10px] text-slate-400">... 외 {selectedTask.relatedProducts.length - 15}개</div>
                    )}
                  </div>
                </div>
              )}

              {/* AI execution */}
              {selectedTask.type === 'ai' && (
                <div>
                  {selectedTask.status === 'done' && selectedTask.result ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium mb-2">
                      <Check size={14} /> 실행 완료
                    </div>
                  ) : executeMutation.isPending && executeMutation.variables === selectedTask.id ? (
                    <div className="flex items-center gap-1.5 text-xs text-blue-500 mb-2">
                      <Loader2 size={14} className="animate-spin" /> 실행 중...
                    </div>
                  ) : selectedTask.status !== 'done' ? (
                    <button
                      onClick={() => executeMutation.mutate(selectedTask.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors mb-2"
                    >
                      <Play size={12} /> 실행
                    </button>
                  ) : null}
                </div>
              )}

              {/* Action result inline */}
              {drawerResult && selectedTask.type === 'ai' && (
                <div className="border rounded-lg p-3 bg-slate-50 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600 mb-2">실행 결과</div>
                  {drawerResult.map((r, i) => (
                    <div key={i} className="flex justify-between text-[11px] gap-2">
                      <span className={cn('text-slate-500 shrink-0', r.highlight && 'text-red-600 font-medium')}>{r.label}</span>
                      <span className={cn('text-slate-700 text-right', r.highlight && 'text-red-600 font-semibold')}>{r.value}</span>
                    </div>
                  ))}
                  {drawerResult.filter(r => r.list).map((r, i) => (
                    <div key={`list-${i}`} className="mt-1 space-y-0.5">
                      {r.list!.map((item, j) => (
                        <div key={j} className="text-[10px] text-slate-500 pl-2 border-l-2 border-slate-200">{item}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-3">
                  <MessageSquare size={12} /> 메모
                </div>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && noteText.trim()) {
                        noteMutation.mutate({ id: selectedTask.id, text: noteText.trim() });
                      }
                    }}
                    placeholder="메모 입력..."
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                  <button
                    onClick={() => {
                      if (noteText.trim()) {
                        noteMutation.mutate({ id: selectedTask.id, text: noteText.trim() });
                      }
                    }}
                    disabled={!noteText.trim() || noteMutation.isPending}
                    className="p-1.5 text-purple-600 hover:text-purple-800 disabled:text-slate-300 rounded"
                  >
                    <Send size={14} />
                  </button>
                </div>
                {Array.isArray(selectedTask.notes) && selectedTask.notes.length > 0 && (
                  <div className="space-y-2">
                    {[...selectedTask.notes].reverse().map((note, i) => (
                      <div key={i} className="text-[11px] text-slate-500 flex gap-2">
                        <span className="text-slate-400 shrink-0">{formatLogTime(note.createdAt)}</span>
                        <span>{note.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity log */}
              {Array.isArray(selectedTask.activityLog) && selectedTask.activityLog.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-3">
                    <Clock size={12} /> 활동 로그
                  </div>
                  <div className="space-y-2">
                    {[...selectedTask.activityLog].reverse().map((log, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                          log.action === 'executed' ? 'bg-emerald-500' :
                          log.action === 'status_changed' ? 'bg-blue-500' :
                          log.action === 'note_added' ? 'bg-amber-500' :
                          'bg-slate-400',
                        )} />
                        <span className="text-slate-500">
                          {log.action === 'status_changed' && `상태 변경: ${log.from ?? '?'} → ${log.to ?? '?'}`}
                          {log.action === 'priority_changed' && `우선순위 변경: ${log.from ?? '?'} → ${log.to ?? '?'}`}
                          {log.action === 'note_added' && '메모 추가'}
                          {log.action === 'executed' && 'AI 실행 완료'}
                        </span>
                        <span className="text-slate-300 ml-auto shrink-0">{formatLogTime(log.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
