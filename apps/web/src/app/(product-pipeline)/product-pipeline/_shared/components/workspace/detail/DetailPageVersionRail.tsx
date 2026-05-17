'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { DetailGenerationRow } from './detail-generation-rows';

interface DetailPageVersionRailProps {
  rows: DetailGenerationRow[];
  selectedKey: string | null;
  applyingKey: string | null;
  duplicatingKey?: string | null;
  renamingKey?: string | null;
  onSelect: (key: string | null) => void;
  onApply: (row: DetailGenerationRow) => void;
  onRename: (row: DetailGenerationRow) => void;
  onDuplicate: (row: DetailGenerationRow) => void;
  onDelete: (row: DetailGenerationRow) => void;
}

function rowBadge(row: DetailGenerationRow): {
  label: string;
  className: string;
} {
  if (row.kind === 'kids-playful') {
    return {
      label: 'TREND VERTICAL',
      className: 'bg-violet-100 text-violet-700',
    };
  }
  if (row.kind === 'bold-vertical') {
    return {
      label: 'KIDITEM DESIGN',
      className: 'bg-sky-100 text-sky-700',
    };
  }
  return {
    label: row.templateLabel,
    className: 'bg-indigo-100 text-indigo-700',
  };
}

function rowTitle(row: DetailGenerationRow): string {
  if (row.kind === 'kids-playful') {
    const result = row.kidsPlayfulEntry?.result as
      | { section1?: { mainHeadline?: unknown } }
      | undefined;
    const title = result?.section1?.mainHeadline;
    if (typeof title === 'string' && title.trim()) return title;
  }
  if (row.kind === 'bold-vertical') {
    const result = row.kidsPlayfulEntry?.result as
      | { hook?: { text?: unknown } }
      | undefined;
    const title = result?.hook?.text;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return row.title || '(제목 없음)';
}

function rowSubtitle(row: DetailGenerationRow): string | null {
  if (row.kind === 'kids-playful') {
    const result = row.kidsPlayfulEntry?.result as
      | { section1?: { subhead?: unknown } }
      | undefined;
    const subtitle = result?.section1?.subhead;
    return typeof subtitle === 'string' && subtitle.trim() ? subtitle : null;
  }
  if (row.kind === 'bold-vertical') {
    const result = row.kidsPlayfulEntry?.result as
      | { hook?: { subtext?: unknown } }
      | undefined;
    const subtitle = result?.hook?.subtext;
    return typeof subtitle === 'string' && subtitle.trim() ? subtitle : null;
  }
  return row.errorMessage;
}

function applyLabel(row: DetailGenerationRow, state: 'idle' | 'applied' | 'applying') {
  if (state === 'applying') return '등록 적용 중...';
  if (state === 'applied') return '등록 상세페이지';
  return '등록 상세로 적용';
}

export default function DetailPageVersionRail({
  rows,
  selectedKey,
  applyingKey,
  duplicatingKey = null,
  renamingKey = null,
  onSelect,
  onApply,
  onRename,
  onDuplicate,
  onDelete,
}: DetailPageVersionRailProps) {
  const selectedRow = selectedKey ? rows.find((row) => row.key === selectedKey) ?? null : null;
  const applying = Boolean(selectedRow && applyingKey === selectedRow.key);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const runMenuAction = (
    row: DetailGenerationRow,
    action: (row: DetailGenerationRow) => void,
  ) => {
    setOpenMenuKey(null);
    action(row);
  };

  return (
    <aside className="flex h-[calc(100vh-190px)] min-h-[520px] w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
        최근 {rows.length} 개
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-slate-400">
          <XCircle size={32} />
          <p className="text-sm font-medium">아직 생성 이력이 없습니다</p>
          <p className="text-xs">상세페이지를 생성하면 여기에 시간순으로 쌓입니다.</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row, index) => {
            const selected = selectedKey === row.key;
            const latest = index === 0;
            const badge = rowBadge(row);
            const subtitle = rowSubtitle(row);
            return (
              <li
                key={row.key}
                className={cn(
                  'relative transition-colors',
                  selected && row.kind === 'bold-vertical' && 'bg-sky-50',
                  selected && row.kind !== 'bold-vertical' && 'bg-violet-50',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuKey(null);
                    onSelect(selected ? null : row.key);
                  }}
                  className={cn(
                    'w-full px-3 py-2.5 pr-10 text-left transition-colors hover:bg-slate-50',
                    selected && row.kind === 'bold-vertical' && 'hover:bg-sky-50',
                    selected && row.kind !== 'bold-vertical' && 'hover:bg-violet-50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        badge.className,
                      )}
                    >
                      {row.kind === 'kids-playful' ? <Sparkles size={9} /> : null}
                      {badge.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {row.isRegistrationDetail ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <CheckCircle2 size={9} />
                          등록 상세
                        </span>
                      ) : null}
                      {latest ? (
                        <span
                          className={cn(
                            'text-[9px] font-bold tracking-wider',
                            row.kind === 'bold-vertical' ? 'text-sky-500' : 'text-violet-500',
                          )}
                        >
                          최신
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs font-semibold text-slate-900" title={rowTitle(row)}>
                    {rowTitle(row)}
                  </p>
                  {subtitle ? (
                    <p
                      className={cn(
                        'mt-0.5 line-clamp-1 text-[10px]',
                        row.errorMessage ? 'text-red-600' : 'text-slate-500',
                      )}
                      title={subtitle}
                    >
                      {subtitle}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatDateTime(new Date(row.createdAt))}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label="상세페이지 버전 작업"
                  aria-expanded={openMenuKey === row.key}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuKey((current) => (current === row.key ? null : row.key));
                  }}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white/80 text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-800"
                >
                  <MoreHorizontal size={15} />
                </button>
                {openMenuKey === row.key ? (
                  <div
                    role="menu"
                    className="absolute right-2 top-9 z-10 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMenuAction(row, onRename)}
                      disabled={renamingKey === row.key}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Pencil size={12} />
                      이름 변경
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMenuAction(row, onDuplicate)}
                      disabled={duplicatingKey === row.key}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Copy size={12} />
                      복제
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMenuAction(row, onDelete)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={12} />
                      삭제
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-2">
        {selectedRow ? (
          <button
            type="button"
            onClick={() => onApply(selectedRow)}
            disabled={selectedRow.isRegistrationDetail || applying}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold text-white transition-colors',
              selectedRow.isRegistrationDetail || applying
                ? 'cursor-default bg-emerald-500'
                : selectedRow.kind === 'bold-vertical'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : selectedRow.kind === 'kids-playful'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : 'bg-indigo-600 hover:bg-indigo-700',
            )}
          >
            {applying ? <Clock size={12} /> : selectedRow.isRegistrationDetail ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}
            {applyLabel(
              selectedRow,
              applying ? 'applying' : selectedRow.isRegistrationDetail ? 'applied' : 'idle',
            )}
          </button>
        ) : (
          <p className="w-full py-1 text-center text-[11px] text-slate-400">
            등록할 상세페이지를 선택하세요
          </p>
        )}
      </div>
    </aside>
  );
}
