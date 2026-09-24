'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus, RotateCcw, Trash2, User, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { TODO_OWNERS, type TodoItem, type TodoOwner, type TodoStatus } from '@kiditem/shared/todo';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { todoApi, todoKeys } from '@/lib/todo-api';

/**
 * TO DO LIST — 사장님이 해 줘야 하는 일과 우리가 만들 일을 한 곳에서 본다.
 *
 * 몰 대량등록처럼 여러 몰 · 여러 화면에 걸친 일은 남은 조각이 흩어진다. 그 조각을 묶음(`area`)으로 모아 두고,
 * 누가 할 일인지(사장님 · 개발) 한 눈에 갈라 본다. 끝낸 줄은 지우지 않고 아래로 내린다.
 */
const OWNER_LABEL: Record<TodoOwner, string> = { operator: '사장님', kiditem: '개발' };
const OWNER_TONE: Record<TodoOwner, string> = {
  operator: 'bg-amber-100 text-amber-800',
  kiditem: 'bg-sky-100 text-sky-800',
};
const STATUS_LABEL: Record<TodoStatus, string> = { open: '할 일', doing: '하는 중', done: '끝' };

export default function TodoPage() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState<TodoOwner | 'all'>('all');
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);

  const list = useQuery({ queryKey: todoKeys.list(), queryFn: todoApi.list });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: todoKeys.all });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) => todoApi.update(id, { status }),
    onSuccess: () => void invalidate(),
    onError: (error) => toast.error(isApiError(error) ? error.message : '고치지 못했습니다.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => todoApi.remove(id),
    onSuccess: () => {
      toast.success('지웠습니다.');
      void invalidate();
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : '지우지 못했습니다.'),
  });

  const items = list.data?.items ?? [];
  const groups = useMemo(() => {
    const visible = items.filter((item) => (ownerFilter === 'all' || item.owner === ownerFilter)
      && (showDone || item.status !== 'done'));
    const byArea = new Map<string, TodoItem[]>();
    for (const item of visible) byArea.set(item.area, [...(byArea.get(item.area) ?? []), item]);
    return [...byArea.entries()].sort((left, right) => right[1].length - left[1].length);
  }, [items, ownerFilter, showDone]);

  const counts = list.data?.counts;
  const ownerCount = (owner: TodoOwner) => items.filter((item) => item.owner === owner && item.status !== 'done').length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">TO DO LIST</h1>
          <p className="mt-1 text-sm text-slate-500">
            사장님이 해 주셔야 하는 일과 개발이 만들 일을 한 곳에 적습니다. 끝낸 일은 지우지 않고 아래로 내려 둡니다.
          </p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> 할 일 추가
        </button>
      </header>

      <section aria-label="요약" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="할 일" value={counts?.open} active={ownerFilter === 'all'} onClick={() => setOwnerFilter('all')} />
        <SummaryCard label="하는 중" value={counts?.doing} />
        <SummaryCard
          label="사장님 몫"
          value={ownerCount('operator')}
          tone="warn"
          active={ownerFilter === 'operator'}
          onClick={() => setOwnerFilter(ownerFilter === 'operator' ? 'all' : 'operator')}
        />
        <SummaryCard
          label="개발 몫"
          value={ownerCount('kiditem')}
          active={ownerFilter === 'kiditem'}
          onClick={() => setOwnerFilter(ownerFilter === 'kiditem' ? 'all' : 'kiditem')}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
          끝낸 일도 보기{counts ? ` (${counts.done})` : ''}
        </label>
        {list.isError && <span className="text-red-600">할 일을 불러오지 못했습니다.</span>}
      </div>

      {adding && <AddTodo onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void invalidate(); }} />}

      {groups.length === 0 && !list.isLoading && (
        <p className="empty-state">적어 둔 할 일이 없습니다.</p>
      )}

      <div className="space-y-4">
        {groups.map(([area, areaItems]) => (
          <section key={area} aria-label={area} className="table-card">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-700">{area}</h2>
              <span className="text-xs text-slate-500">{areaItems.filter((item) => item.status !== 'done').length}개 남음</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {areaItems.map((item) => (
                <li key={item.id} className={cn('flex items-start gap-3 px-4 py-3', item.status === 'done' && 'bg-slate-50/70')}>
                  <button
                    type="button"
                    aria-label={item.status === 'done' ? '다시 할 일로' : '끝낸 일로'}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                      item.status === 'done' ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-slate-300 text-transparent hover:border-emerald-400',
                    )}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: item.id, status: item.status === 'done' ? 'open' : 'done' })}
                  >
                    <Check size={14} aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', OWNER_TONE[item.owner])}>
                        {item.owner === 'operator' ? <User size={11} className="mr-0.5 inline" aria-hidden /> : <Wrench size={11} className="mr-0.5 inline" aria-hidden />}
                        {OWNER_LABEL[item.owner]}
                      </span>
                      <p className={cn('text-sm font-medium text-slate-800', item.status === 'done' && 'text-slate-400 line-through')}>
                        {item.title}
                      </p>
                      {item.status === 'doing' && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{STATUS_LABEL.doing}</span>}
                    </div>
                    {item.detail && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{item.detail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status !== 'done' && (
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: item.id, status: item.status === 'doing' ? 'open' : 'doing' })}
                      >
                        {item.status === 'doing' ? <RotateCcw size={14} aria-hidden /> : '하는 중'}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="지우기"
                      className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(item.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {list.isLoading && <p className="empty-state"><Loader2 size={16} className="mr-1 inline animate-spin" aria-hidden /> 불러오는 중</p>}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | undefined;
  tone?: 'warn';
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>
        {value ?? '—'}
      </p>
    </>
  );
  if (!onClick) return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white px-4 py-3 text-left transition',
        active ? 'border-purple-400 ring-1 ring-purple-200' : 'border-slate-200 hover:border-purple-300',
      )}
    >
      {content}
    </button>
  );
}

function AddTodo({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [owner, setOwner] = useState<TodoOwner>('kiditem');
  const [area, setArea] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const create = useMutation({
    mutationFn: () => todoApi.create({ owner, area: area.trim(), title: title.trim(), detail: detail.trim() || null }),
    onSuccess: () => {
      toast.success('추가했습니다.');
      onAdded();
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : '추가하지 못했습니다.'),
  });
  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!area.trim() || !title.trim()) return;
        create.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">누가</span>
          <select value={owner} onChange={(event) => setOwner(event.target.value as TodoOwner)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
            {TODO_OWNERS.map((value) => <option key={value} value={value}>{OWNER_LABEL[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">묶음</span>
          <input value={area} onChange={(event) => setArea(event.target.value)} placeholder="몰 대량등록" className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">할 일</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">메모(없어도 됩니다)</span>
        <textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
        <button type="submit" className="btn-primary" disabled={create.isPending || !area.trim() || !title.trim()}>
          {create.isPending ? '넣는 중…' : '추가'}
        </button>
      </div>
    </form>
  );
}
