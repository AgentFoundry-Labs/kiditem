'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/hooks/useAuth';
import { parseActionResult } from '../lib/actions';
import {
  getActionBoardColumns,
  getActionTaskColumnKey,
} from '../lib/action-board-columns';
import type { ActionTask } from '@kiditem/shared/action-task';
import type { ActionResult } from '../lib/actions';
import type { Scope, ViewMode } from '../lib/action-board-columns';

export function useActionBoardWorkflow() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [viewMode, setViewMode] = useState<ViewMode>('status');
  const [selectedTask, setSelectedTask] = useState<ActionTask | null>(null);
  const [noteText, setNoteText] = useState('');
  const [drawerResult, setDrawerResult] = useState<ActionResult[] | null>(null);
  const scope = (searchParams.get('scope') as Scope | null) ?? 'all';
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const setScope = (next: Scope) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('scope');
    else params.set('scope', next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const { data: tasks = [], isLoading, isPlaceholderData } = useQuery({
    queryKey: queryKeys.actionTasks.list(scope),
    queryFn: () => apiClient.get<ActionTask[]>(
      scope === 'all' ? '/api/action-tasks' : `/api/action-tasks?assignedTo=${scope}`,
    ),
    placeholderData: previousTasks => previousTasks,
    refetchInterval: 60_000,
  });

  const refreshTasks = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; priority?: string }) =>
      apiClient.patch<ActionTask>(`/api/action-tasks/${id}`, body),
    onSuccess: (updated) => {
      refreshTasks();
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiClient.post<ActionTask>(`/api/action-tasks/${id}/notes`, { text }),
    onSuccess: (updated) => {
      refreshTasks();
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
      setNoteText('');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ActionTask>(`/api/action-tasks/${id}/execute`),
    onSuccess: (updated) => {
      refreshTasks();
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

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.patch<ActionTask>(`/api/action-tasks/${taskId}/claim`, {}),
    onSuccess: () => {
      refreshTasks();
      toast.success('맡았습니다');
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 409) {
        toast.error('이미 다른 사람이 맡았습니다');
      } else {
        toast.error('실패');
      }
    },
  });

  const unclaimMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.patch<ActionTask>(`/api/action-tasks/${taskId}/unclaim`, {}),
    onSuccess: () => {
      refreshTasks();
      toast.success('해제했습니다');
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 409) {
        toast.error('본인 담당 업무만 해제할 수 있습니다');
      } else {
        toast.error('실패');
      }
    },
  });

  const getColumnKey = (task: ActionTask) => getActionTaskColumnKey(task, viewMode);
  const columns = getActionBoardColumns(viewMode);

  const openDrawer = (task: ActionTask) => {
    setSelectedTask(task);
    setDrawerResult(null);
    setNoteText('');
    if (task.type === 'ai' && task.result) {
      setDrawerResult(parseActionResult(task.taskKey, task.result));
    }
  };

  const closeDrawer = () => setSelectedTask(null);

  return {
    viewMode,
    setViewMode,
    selectedTask,
    noteText,
    setNoteText,
    drawerResult,
    scope,
    setScope,
    currentUserId,
    tasks,
    isLoading,
    isRefreshing: isPlaceholderData,
    refreshTasks,
    updateMutation,
    noteMutation,
    executeMutation,
    claimMutation,
    unclaimMutation,
    getColumnKey,
    columns,
    openDrawer,
    closeDrawer,
  };
}

export type ActionBoardWorkflowState = ReturnType<typeof useActionBoardWorkflow>;
