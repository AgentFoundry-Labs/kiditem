'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { confirmReportApi, type ConfirmReportStatus } from '../lib/confirm-report-api';

/** 텔레그램 답장은 서버가 받아 최종 선택에 쓴다. 화면은 이 간격으로 결정 수를 다시 읽는다. */
const STATUS_POLL_MS = 20_000;

export interface PipeConfirmChannel {
  status: ConfirmReportStatus | null;
  failed: boolean;
  sending: boolean;
  /** 텔레그램으로 실제 보고를 보낸다. 사람이 버튼을 누를 때만 부른다. */
  send: () => void;
}

/**
 * 사장님 컨펌 보고 — 연결 상태 · 최종 후보 결정 수 읽기와 "지금 보고 보내기".
 *
 * 보고는 자동으로 나가지 않는다. 메시지를 보내는 일이라 사람이 누를 때만 보낸다.
 */
export function useConfirmReport(): PipeConfirmChannel {
  const organizationId = useAuth().user?.organizationId ?? null;
  const queryClient = useQueryClient();
  const queryKey = queryKeys.sourcing.workspace.confirmReport(organizationId ?? 'no-organization');

  const status = useQuery({
    queryKey,
    queryFn: confirmReportApi.status,
    enabled: organizationId !== null,
    refetchInterval: STATUS_POLL_MS,
    meta: { suppressGlobalErrorToast: true },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: confirmReportApi.sendTelegram,
    onSuccess: (result) => {
      toast.success(`텔레그램으로 최종 후보 ${result.reported}개를 보고했습니다.`);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(friendlyError(error) ?? '텔레그램 보고를 보내지 못했습니다.');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const send = useCallback(() => mutate(), [mutate]);

  return useMemo(
    () => ({ status: status.data ?? null, failed: status.isError, sending: isPending, send }),
    [status.data, status.isError, isPending, send],
  );
}
