'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { todayYmd } from '../lib/order-collection-page-model';
import {
  beginSellpiaShipmentTrackingSourceAttempt,
  getSellpiaShipmentTrackingEnvironmentKey,
  isSellpiaShipmentTrackingAttemptNotFound,
  newSellpiaShipmentTrackingIdempotencyKey,
  readActiveSellpiaShipmentTrackingAttempt,
  readSellpiaShipmentTrackingSource,
  readSellpiaShipmentTrackingSourceAttempt,
  prepareSellpiaShipmentTrackingExtension,
  rememberActiveSellpiaShipmentTrackingAttempt,
  sourcePayloadRows,
  startSellpiaShipmentTrackingBrowser,
  type ActiveSellpiaShipmentTrackingAttempt,
  type SellpiaShipmentTrackingSourceAttempt,
} from '../lib/sellpia-shipment-tracking-source-owner';

type ActiveScope = {
  organizationId: string;
  environmentKey: string;
  attempt: ActiveSellpiaShipmentTrackingAttempt | null;
};

function attemptQueryKey(
  organizationId: string,
  environmentKey: string,
  attemptId: string,
) {
  return [
    'orders',
    'sellpia-shipment-tracking-source-attempt',
    organizationId,
    environmentKey,
    attemptId,
  ] as const;
}

/**
 * Sellpia shipment tracking owns one provider capture for the whole Orders
 * screen. Mount/reload only observes the persisted public attempt; an
 * extension action is sent from collect(), after an explicit user click.
 */
export function useSellpiaShipmentTrackingSourceOwner() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const environmentKey = getSellpiaShipmentTrackingEnvironmentKey();
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    if (!organizationId) {
      setActiveScope(null);
      return;
    }
    setActiveScope({
      organizationId,
      environmentKey,
      attempt: readActiveSellpiaShipmentTrackingAttempt(organizationId, environmentKey),
    });
  }, [environmentKey, organizationId]);

  const scopedAttempt = activeScope?.organizationId === organizationId
    && activeScope.environmentKey === environmentKey
    ? activeScope.attempt
    : null;
  const ownerQuery = useQuery(collectionSourceStatusQueryOptions({
    queryKey: scopedAttempt?.attemptId && organizationId
      ? attemptQueryKey(organizationId, environmentKey, scopedAttempt.attemptId)
      : ['orders', 'sellpia-shipment-tracking-source-attempt', organizationId ?? '', environmentKey, 'none'] as const,
    queryFn: () => readSellpiaShipmentTrackingSourceAttempt(scopedAttempt!.attemptId!),
    enabled: Boolean(organizationId && scopedAttempt?.attemptId),
    refetchInterval: (query) => query.state.data?.state === 'RUNNING' ? 2_000 : false,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }));

  const setScopedAttempt = useCallback((attempt: ActiveSellpiaShipmentTrackingAttempt) => {
    if (!organizationId) return;
    rememberActiveSellpiaShipmentTrackingAttempt(organizationId, attempt, environmentKey);
    setActiveScope({ organizationId, environmentKey, attempt });
  }, [environmentKey, organizationId]);

  const readRowsForCompleteAttempt = useCallback(async (
    attempt: SellpiaShipmentTrackingSourceAttempt,
  ) => {
    if (attempt.state !== 'COMPLETE') return null;
    const payload = await readSellpiaShipmentTrackingSource(attempt.attemptId);
    if (payload.range.start < attempt.plan.startDate || payload.range.end > attempt.plan.endDate
      || payload.range.start > payload.range.end) {
      throw new Error('셀피아 송장 원본의 조회 기간이 요청 범위를 벗어났습니다.');
    }
    if ((payload.confirmedRange?.start ?? null) !== (attempt.coverageStartDate ?? null)
      || (payload.confirmedRange?.end ?? null) !== (attempt.coverageEndDate ?? null)) {
      throw new Error('셀피아 송장 원본의 확인 기간이 저장된 수집 근거와 일치하지 않습니다.');
    }
    return sourcePayloadRows(payload);
  }, []);

  const collect = useCallback(async () => {
    if (!organizationId) {
      throw new Error('셀피아 송장 조회를 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    if (startingRef.current) {
      throw new Error('셀피아 송장 조회가 이미 시작되었습니다.');
    }
    startingRef.current = true;
    try {
      const today = todayYmd();
      let persisted = readActiveSellpiaShipmentTrackingAttempt(organizationId, environmentKey);
      if (persisted?.attemptId) {
        try {
          const current = await readSellpiaShipmentTrackingSourceAttempt(persisted.attemptId);
          queryClient.setQueryData(
            attemptQueryKey(organizationId, environmentKey, current.attemptId),
            current,
          );
          if (current.plan.startDate === today && current.state === 'COMPLETE') {
            const rows = await readRowsForCompleteAttempt(current);
            if (rows) return rows;
          }
          if (current.plan.startDate !== today || current.state === 'FAILED') {
            persisted = { attemptId: null, idempotencyKey: null };
            setScopedAttempt(persisted);
          }
        } catch (error) {
          if (!isSellpiaShipmentTrackingAttemptNotFound(error)) throw error;
          // Only this explicit start clears a foreign/stale organization or
          // environment reference. The passive query above remains read-only.
          persisted = { attemptId: null, idempotencyKey: null };
          setScopedAttempt(persisted);
        }
      }

      let attempt: SellpiaShipmentTrackingSourceAttempt;
      if (persisted?.attemptId) {
        attempt = await readSellpiaShipmentTrackingSourceAttempt(persisted.attemptId);
      } else {
        const idempotencyKey = persisted?.idempotencyKey ?? newSellpiaShipmentTrackingIdempotencyKey();
        // Persist before admission so a lost begin ACK replays the same owner key.
        setScopedAttempt({ attemptId: null, idempotencyKey });
        try {
          const started = await beginSellpiaShipmentTrackingSourceAttempt(idempotencyKey, today);
          attempt = started;
          setScopedAttempt({ attemptId: started.attemptId, idempotencyKey });
          queryClient.setQueryData(
            attemptQueryKey(organizationId, environmentKey, started.attemptId),
            started,
          );
        } catch (error) {
          if (isApiError(error) && error.status >= 400 && error.status < 500) {
            setScopedAttempt({ attemptId: null, idempotencyKey: null });
          }
          throw error;
        }
      }

      if (attempt.state === 'COMPLETE') {
        const rows = await readRowsForCompleteAttempt(attempt);
        if (rows) return rows;
      }
      if (attempt.state === 'FAILED') {
        throw new Error(attempt.errorMessage ?? '셀피아 송장 조회가 실패했습니다.');
      }

      const extensionId = await prepareSellpiaShipmentTrackingExtension();
      try {
        await startSellpiaShipmentTrackingBrowser(extensionId, attempt.attemptId);
      } catch (error) {
        // A lost extension response may still have committed COMPLETE/FAILED;
        // read the owner before surfacing an error or asking for a retry.
        const observed = await readSellpiaShipmentTrackingSourceAttempt(attempt.attemptId).catch(() => null);
        if (!observed) throw error;
        attempt = observed;
      }

      const observed = await readSellpiaShipmentTrackingSourceAttempt(attempt.attemptId);
      queryClient.setQueryData(
        attemptQueryKey(organizationId, environmentKey, observed.attemptId),
        observed,
      );
      if (observed.state === 'COMPLETE') {
        const rows = await readRowsForCompleteAttempt(observed);
        if (rows) return rows;
      }
      if (observed.state === 'FAILED') {
        throw new Error(observed.errorMessage ?? '셀피아 송장 조회가 실패했습니다.');
      }
      throw new Error('셀피아 송장 조회가 아직 완료되지 않았습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      startingRef.current = false;
    }
  }, [
    environmentKey,
    organizationId,
    queryClient,
    readRowsForCompleteAttempt,
    setScopedAttempt,
  ]);

  return {
    attempt: ownerQuery.data ?? null,
    error: ownerQuery.error ?? null,
    isLoading: ownerQuery.isLoading,
    collect,
  };
}
