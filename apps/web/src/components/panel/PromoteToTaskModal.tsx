'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { PanelAlertItem } from '@kiditem/shared/panel';

interface PromoteToTaskModalProps {
  alert: PanelAlertItem;
  open: boolean;
  onClose: () => void;
}

// Client-side mirror of server severity → priority mapping
const SEVERITY_TO_PRIORITY: Record<string, 'urgent' | 'high' | 'medium'> = {
  critical: 'urgent',
  error: 'high',
  warning: 'medium',
  info: 'medium',
};

function mapSeverityToPriority(severity: string): 'urgent' | 'high' | 'medium' {
  return SEVERITY_TO_PRIORITY[severity] ?? 'medium';
}

interface PromoteDto {
  priorityOverride?: 'urgent' | 'high' | 'medium';
  roleOverride?: string;
  note?: string;
}

const PRIORITY_LABELS: Record<'urgent' | 'high' | 'medium', string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
};

export function PromoteToTaskModal({ alert, open, onClose }: PromoteToTaskModalProps) {
  const defaultPriority = mapSeverityToPriority(alert.severity);
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium'>(defaultPriority);
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');

  const qc = useQueryClient();

  const promoteMutation = useMutation({
    mutationFn: async (dto: PromoteDto) =>
      apiClient.post(`/api/alerts/${encodeURIComponent(alert.id)}/promote`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.actionTasks.all });
      toast.success('할 일 목록에 추가했습니다');
      onClose();
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 409) {
        toast.error('이미 할 일로 등록된 알림입니다');
      } else {
        toast.error('할 일 추가 실패');
      }
      onClose();
    },
  });

  function submitPromotion() {
    if (promoteMutation.isPending) return;
    const dto: PromoteDto = {};
    if (priority !== defaultPriority) dto.priorityOverride = priority;
    if (role.trim()) dto.roleOverride = role.trim();
    if (note.trim()) dto.note = note.trim();
    promoteMutation.mutate(dto);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitPromotion();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[120]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[130]',
            'w-full max-w-md bg-white rounded-lg border border-gray-200 shadow-lg',
            'p-6 focus:outline-none',
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold text-gray-900">
              할 일 목록에 추가
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <Dialog.Description className="sr-only">
            알림을 작업 보드에서 추적할 수 있는 할 일로 전환합니다.
          </Dialog.Description>

          <div className="mb-4 text-xs text-gray-500 truncate">
            {alert.title}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Priority select */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                우선순위
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'urgent' | 'high' | 'medium')}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {(['urgent', 'high', 'medium'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            {/* Role input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                담당 역할 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: ad, inventory, finance"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Note textarea */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                메모 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="추가 메모를 입력하세요"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <div className="text-right text-xs text-gray-400 mt-0.5">{note.length}/500</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPromotion}
                disabled={promoteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {promoteMutation.isPending ? '추가 중...' : '할 일 목록에 추가'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
