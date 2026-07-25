'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  prepareWingRegistration,
  type WingRegistrationDraft,
} from '../lib/wing-registration-flow';

interface WingRegistrationPreparationCallbacks {
  onReady: (draft: WingRegistrationDraft) => void;
  onError: (message: string) => void;
}

interface PreparationAttempt {
  candidateId: string;
  sequence: number;
}

export function useWingRegistrationPreparation(
  callbacks: WingRegistrationPreparationCallbacks,
) {
  const [attempt, setAttempt] = useState<PreparationAttempt | null>(null);
  const sequence = useRef(0);
  const retryFailedSequence = useRef<number | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const query = useQuery({
    queryKey: [
      'wing-registration-preparation',
      attempt?.candidateId ?? null,
      attempt?.sequence ?? 0,
    ],
    queryFn: () => {
      const retryFailed = retryFailedSequence.current === attempt!.sequence;
      retryFailedSequence.current = null;
      return prepareWingRegistration(attempt!.candidateId, undefined, {
        retryFailed,
      });
    },
    enabled: attempt !== null,
    retry: false,
    refetchInterval: (current) =>
      current.state.data?.status === 'processing' ? 2_000 : false,
  });

  useEffect(() => {
    if (!attempt) return;
    if (query.data?.status === 'ready') {
      callbacksRef.current.onReady(query.data.draft);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
      return;
    }
    if (query.data?.status === 'failed') {
      callbacksRef.current.onError(query.data.message);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
      return;
    }
    if (query.error) {
      callbacksRef.current.onError(
        query.error instanceof Error
          ? query.error.message
          : '쿠팡 WING 등록 준비에 실패했습니다.',
      );
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
    }
  }, [attempt, query.data, query.error]);

  const start = useCallback((candidateId: string) => {
    sequence.current += 1;
    retryFailedSequence.current = sequence.current;
    setAttempt({ candidateId, sequence: sequence.current });
  }, []);

  const cancel = useCallback(() => setAttempt(null), []);

  return {
    start,
    cancel,
    isPreparing: attempt !== null,
    message:
      query.data?.status === 'processing'
        ? query.data.message
        : attempt
          ? '쿠팡 WING 등록을 준비하고 있습니다.'
          : null,
  };
}
