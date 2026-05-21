'use client';

import Link from 'next/link';
import {
  Check,
  Loader2,
  Play,
  Sparkles,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { severityBgColor } from '../lib/action-board-columns';
import type { ActionTask } from '@kiditem/shared/action-task';
import type { ActionBoardWorkflowState } from '../hooks/useActionBoardWorkflow';

type ActionBoardKanbanBaseProps = Pick<
  ActionBoardWorkflowState,
  | 'tasks'
  | 'columns'
  | 'getColumnKey'
  | 'currentUserId'
  | 'selectedTask'
  | 'openDrawer'
  | 'closeDrawer'
  | 'updateMutation'
  | 'executeMutation'
  | 'claimMutation'
  | 'unclaimMutation'
>;

type ActionBoardKanbanProps = ActionBoardKanbanBaseProps & {
  isRefreshing?: boolean;
};

export function ActionBoardKanban({
  tasks,
  columns,
  getColumnKey,
  currentUserId,
  selectedTask,
  openDrawer,
  closeDrawer,
  updateMutation,
  executeMutation,
  claimMutation,
  unclaimMutation,
  isRefreshing = false,
}: ActionBoardKanbanProps) {
  return (
    <div className="relative flex-1 overflow-x-auto p-4" aria-busy={isRefreshing}>
      {isRefreshing && (
        <div className="absolute right-6 top-6 z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
          <Loader2 size={13} className="animate-spin text-purple-600" />
          목록 갱신 중
        </div>
      )}
      <div
        className={cn(
          'flex flex-col md:inline-grid md:grid-flow-col gap-0 divide-y md:divide-y-0 md:divide-x border rounded-xl overflow-hidden min-w-full',
        )}
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}
      >
        {columns.map(col => {
          const colTasks = tasks.filter(t => getColumnKey(t) === col.key);
          return (
            <ActionBoardColumn
              key={col.key}
              column={col}
              tasks={colTasks}
              currentUserId={currentUserId}
              selectedTask={selectedTask}
              openDrawer={openDrawer}
              closeDrawer={closeDrawer}
              updateMutation={updateMutation}
              executeMutation={executeMutation}
              claimMutation={claimMutation}
              unclaimMutation={unclaimMutation}
            />
          );
        })}
      </div>
    </div>
  );
}

type ActionBoardColumnProps = {
  column: ActionBoardWorkflowState['columns'][number];
  tasks: ActionTask[];
} & Omit<ActionBoardKanbanProps, 'tasks' | 'columns' | 'getColumnKey'>;

function ActionBoardColumn({
  column,
  tasks,
  currentUserId,
  selectedTask,
  openDrawer,
  closeDrawer,
  updateMutation,
  executeMutation,
  claimMutation,
  unclaimMutation,
}: ActionBoardColumnProps) {
  return (
    <div className="flex flex-col min-h-0 bg-slate-50/50">
      <div className="px-4 py-3 border-b bg-white/80">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', column.dot)} />
          <span className="text-sm font-medium text-slate-700">{column.label}</span>
          <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-medium', column.badge)}>
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        {tasks.map(task => (
          <ActionBoardTaskCard
            key={task.id}
            task={task}
            currentUserId={currentUserId}
            isSelected={selectedTask?.id === task.id}
            openDrawer={openDrawer}
            closeDrawer={closeDrawer}
            updateMutation={updateMutation}
            executeMutation={executeMutation}
            claimMutation={claimMutation}
            unclaimMutation={unclaimMutation}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center text-[11px] text-slate-300 py-8">항목 없음</div>
        )}
      </div>
    </div>
  );
}

type ActionBoardTaskCardProps = Pick<
  ActionBoardKanbanProps,
  | 'currentUserId'
  | 'openDrawer'
  | 'closeDrawer'
  | 'updateMutation'
  | 'executeMutation'
  | 'claimMutation'
  | 'unclaimMutation'
> & {
  task: ActionTask;
  isSelected: boolean;
};

function ActionBoardTaskCard({
  task,
  currentUserId,
  isSelected,
  openDrawer,
  closeDrawer,
  updateMutation,
  executeMutation,
  claimMutation,
  unclaimMutation,
}: ActionBoardTaskCardProps) {
  const isMine = currentUserId !== null && task.assigneeUserId === currentUserId;

  return (
    <div
      role="button"
      aria-label={task.label}
      tabIndex={0}
      onClick={() => openDrawer(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openDrawer(task);
        if (e.key === 'Escape') closeDrawer();
      }}
      className={cn(
        'rounded-lg border p-3 shadow-sm cursor-pointer transition-all hover:shadow-md',
        task.type === 'ai'
          ? 'border-violet-200 bg-violet-50/30'
          : 'border-slate-200 bg-white',
        task.status === 'done' && 'opacity-60',
        isSelected && 'ring-2 ring-blue-400',
      )}
    >
      {task.sourceAlert && (
        <div className="mb-2">
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium',
            severityBgColor(task.sourceAlert.severity),
          )}>
            ← {task.sourceAlert.title.slice(0, 20)}
          </span>
        </div>
      )}

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

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <User size={10} />
          {task.assigneeUser?.name ?? '(미담당)'}
        </div>
        {task.assigneeUserId == null ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              claimMutation.mutate(task.id);
            }}
            disabled={claimMutation.isPending}
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            내가 맡기
          </button>
        ) : isMine ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              unclaimMutation.mutate(task.id);
            }}
            disabled={unclaimMutation.isPending}
            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            해제
          </button>
        ) : (
          <span className="text-[10px] text-slate-400">{task.assigneeUser?.name}님 담당</span>
        )}
      </div>
    </div>
  );
}
