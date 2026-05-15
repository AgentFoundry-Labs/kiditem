'use client';

import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  Play,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionBoardWorkflowState } from '../hooks/useActionBoardWorkflow';
import {
  PRIORITY_OPTIONS,
  ROLE_LABELS,
  STATUS_OPTIONS,
  formatActionBoardTime,
  getActionTaskRole,
  severityBgColor,
} from '../lib/action-board-columns';

type ActionTaskDrawerProps = Pick<
  ActionBoardWorkflowState,
  | 'selectedTask'
  | 'currentUserId'
  | 'noteText'
  | 'setNoteText'
  | 'drawerResult'
  | 'closeDrawer'
  | 'updateMutation'
  | 'noteMutation'
  | 'executeMutation'
  | 'claimMutation'
  | 'unclaimMutation'
>;

export function ActionTaskDrawer({
  selectedTask,
  currentUserId,
  noteText,
  setNoteText,
  drawerResult,
  closeDrawer,
  updateMutation,
  noteMutation,
  executeMutation,
  claimMutation,
  unclaimMutation,
}: ActionTaskDrawerProps) {
  return (
    <>
      {selectedTask && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={closeDrawer}
        />
      )}

      <div
        role="dialog"
        aria-label="상세 정보"
        onKeyDown={(e) => { if (e.key === 'Escape') closeDrawer(); }}
        className={cn(
          'fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl border-l border-slate-200 z-50',
          'transform transition-transform duration-300',
          selectedTask ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {selectedTask && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                {selectedTask.type === 'ai'
                  ? <Sparkles size={16} className="text-violet-500" />
                  : <ClipboardList size={16} className="text-slate-500" />
                }
                <span className="text-sm font-semibold text-slate-900">
                  {selectedTask.type === 'ai' ? '자동 실행 작업' : '사람 작업'}
                </span>
              </div>
              <button
                onClick={closeDrawer}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
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

                {(selectedTask.role || getActionTaskRole(selectedTask.taskKey)) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                    {ROLE_LABELS[selectedTask.role || getActionTaskRole(selectedTask.taskKey)] ?? selectedTask.role}
                  </span>
                )}
              </div>

              <div>
                <h3 className={cn(
                  'text-sm font-semibold text-slate-900',
                  selectedTask.status === 'done' && 'line-through text-slate-400',
                )}>
                  {selectedTask.label}
                </h3>
              </div>

              {selectedTask.sourceAlert && (
                <div>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium',
                    severityBgColor(selectedTask.sourceAlert.severity),
                  )}>
                    ← {selectedTask.sourceAlert.title.slice(0, 20)}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <User size={13} className="text-slate-400" />
                <span className="text-xs text-slate-500">
                  {selectedTask.assigneeUser?.name ?? '(미담당)'}
                </span>
                <DrawerAssigneeAction
                  taskId={selectedTask.id}
                  assigneeUserId={selectedTask.assigneeUserId}
                  currentUserId={currentUserId}
                  claimMutation={claimMutation}
                  unclaimMutation={unclaimMutation}
                />
              </div>

              <div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {selectedTask.detail}
                </p>
              </div>

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
                    aria-label="메모 추가"
                  >
                    <Send size={14} />
                  </button>
                </div>
                {Array.isArray(selectedTask.notes) && selectedTask.notes.length > 0 && (
                  <div className="space-y-2">
                    {[...selectedTask.notes].reverse().map((note, i) => (
                      <div key={i} className="text-[11px] text-slate-500 flex gap-2">
                        <span className="text-slate-400 shrink-0">{formatActionBoardTime(note.createdAt)}</span>
                        <span>{note.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                          {log.action === 'executed' && '실행 완료'}
                        </span>
                        <span className="text-slate-300 ml-auto shrink-0">{formatActionBoardTime(log.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type DrawerAssigneeActionProps = Pick<
  ActionTaskDrawerProps,
  'currentUserId' | 'claimMutation' | 'unclaimMutation'
> & {
  taskId: string;
  assigneeUserId: string | null | undefined;
};

function DrawerAssigneeAction({
  taskId,
  assigneeUserId,
  currentUserId,
  claimMutation,
  unclaimMutation,
}: DrawerAssigneeActionProps) {
  const isMine = currentUserId !== null && assigneeUserId === currentUserId;
  if (assigneeUserId == null) {
    return (
      <button
        onClick={() => claimMutation.mutate(taskId)}
        disabled={claimMutation.isPending}
        className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
      >
        내가 맡기
      </button>
    );
  }
  if (isMine) {
    return (
      <button
        onClick={() => unclaimMutation.mutate(taskId)}
        disabled={unclaimMutation.isPending}
        className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        해제
      </button>
    );
  }
  return null;
}
