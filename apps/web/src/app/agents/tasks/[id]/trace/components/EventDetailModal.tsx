'use client';

import { X } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentEvent } from '@kiditem/shared';

interface EventDetailModalProps {
  event: AgentEvent | null;
  onClose: () => void;
}

function safeJson(value: unknown): string {
  if (value == null) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {event.eventType}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(event.createdAt)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          <Field label="category" value={event.category ?? '-'} />
          <Field label="action" value={event.action ?? '-'} />
          <Field label="detail" value={event.detail ?? '-'} />
          <Field label="tableName" value={event.tableName ?? '-'} />
          <Field label="recordId" value={event.recordId ?? '-'} />
          <Field label="fieldName" value={event.fieldName ?? '-'} />
          <Field label="runId" value={event.runId ?? '-'} />

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">valueBefore</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-60 overflow-y-auto">
              {safeJson(event.valueBefore)}
            </pre>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">valueAfter</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-60 overflow-y-auto">
              {safeJson(event.valueAfter)}
            </pre>
          </div>

          {event.restoredAt && (
            <Field label="restoredAt" value={formatDateTime(event.restoredAt)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-800 break-all">{value}</span>
    </div>
  );
}
