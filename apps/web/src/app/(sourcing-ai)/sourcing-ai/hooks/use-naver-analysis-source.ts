'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { keywordAnalysisSnapshotQueryKey, type KeywordAnalysisInput, type KeywordAnalysisSnapshot } from '../lib/keyword-analysis-snapshot-api';

interface AnalysisAttempt { attemptId: string; state: 'RUNNING' | 'COMPLETE' | 'FAILED'; errorMessage: string | null }
interface AnalysisStatus { latestAttempt: AnalysisAttempt | null; actualCutoffAt: string | null }

export function useNaverAnalysisSource({ input }: { input: KeywordAnalysisInput }) {
  const client = useQueryClient();
  const requestKeys = useRef(new Map<string, { key: string; attemptId: string | null }>());
  const [error, setError] = useState<string | null>(null);
  const statusKey = [...keywordAnalysisSnapshotQueryKey(input), 'status'];
  const status = useQuery({ queryKey: statusKey,
    queryFn: () => apiClient.get<AnalysisStatus>('/api/sourcing/keyword-analysis/status?input=' + encodeURIComponent(JSON.stringify(input))),
    refetchInterval: (query) => query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false,
  });
  const completeId = status.data?.latestAttempt?.state === 'COMPLETE' ? status.data.latestAttempt.attemptId : null;
  useEffect(() => {
    if (completeId) {
      setError(null);
      void client.invalidateQueries({ queryKey: keywordAnalysisSnapshotQueryKey(input),
        predicate: (query) => !query.queryKey.includes('status') });
    }
  }, [client, completeId, input]);
  useEffect(() => {
    const terminal = status.data?.latestAttempt;
    if (!terminal || terminal.state === 'RUNNING') return;
    for (const [fingerprint, request] of requestKeys.current) {
      if (request.attemptId === terminal.attemptId) {
        requestKeys.current.delete(fingerprint);
        setError(null);
      }
    }
  }, [status.data]);
  const mutation = useMutation({ mutationFn: async (requested: KeywordAnalysisInput) => {
    const fingerprint = JSON.stringify(requested);
    const request = requestKeys.current.get(fingerprint) ?? { key: crypto.randomUUID(), attemptId: null };
    requestKeys.current.set(fingerprint, request);
    const result = await apiClient.post<{ attempt: AnalysisAttempt; payload: KeywordAnalysisSnapshot | null }>(
      '/api/sourcing/keyword-analysis/collect', requested,
      { headers: { 'Idempotency-Key': request.key }, timeoutMs: 15 * 60_000 });
    if (result.attempt.state !== 'RUNNING') requestKeys.current.delete(fingerprint);
    else request.attemptId = result.attempt.attemptId;
    if (result.payload) client.setQueryData(keywordAnalysisSnapshotQueryKey(requested), result.payload);
    if (result.attempt.state === 'FAILED') setError(result.attempt.errorMessage ?? '네이버 분석 수집 실패');
    await client.invalidateQueries({ queryKey: [...keywordAnalysisSnapshotQueryKey(requested), 'status'] });
    return result;
  } });
  const collect = async (requested = input) => {
    setError(null);
    try { return await mutation.mutateAsync(requested); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : '네이버 분석 수집 실패';
      setError(message); toast.error(message); return null;
    }
  };
  return { collect, error: error ?? status.data?.latestAttempt?.errorMessage ?? null,
    isCollecting: mutation.isPending || status.data?.latestAttempt?.state === 'RUNNING',
    actualCutoffAt: status.data?.actualCutoffAt ?? null };
}
