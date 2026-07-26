'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  prepareWingRegistration,
  type WingRegistrationDraft,
} from '../lib/wing-registration-flow';
import type { DetailPageRasterProgressPhase } from '@/lib/extension-bridge';

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
  const [renderPhase, setRenderPhase] = useState<DetailPageRasterProgressPhase | null>(null);
  const sequence = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const query = useQuery({
    queryKey: [
      'wing-registration-preparation',
      attempt?.candidateId ?? null,
      attempt?.sequence ?? 0,
    ],
    queryFn: () => prepareWingRegistration(attempt!.candidateId, undefined, {
      onRenderProgress: setRenderPhase,
    }),
    enabled: attempt !== null,
    retry: false,
    refetchInterval: false,
  });

  useEffect(() => {
    if (!attempt) return;
    if (query.data?.status === 'ready') {
      callbacksRef.current.onReady(query.data.draft);
      setRenderPhase(null);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
      return;
    }
    if (query.data?.status === 'failed') {
      callbacksRef.current.onError(query.data.message);
      setRenderPhase(null);
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
      setRenderPhase(null);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
    }
  }, [attempt, query.data, query.error]);

  const start = useCallback((candidateId: string) => {
    sequence.current += 1;
    setRenderPhase('loading');
    setAttempt({ candidateId, sequence: sequence.current });
  }, []);

  const cancel = useCallback(() => {
    setAttempt(null);
    setRenderPhase(null);
  }, []);

  return {
    start,
    cancel,
    isPreparing: attempt !== null,
    message: attempt ? renderPhaseMessage(renderPhase) : null,
  };
}

function renderPhaseMessage(phase: DetailPageRasterProgressPhase | null): string {
  switch (phase) {
    case 'capturing':
      return '상세페이지를 긴 이미지 한 장으로 캡처하고 있습니다.';
    case 'uploading':
      return '상세페이지 이미지를 저장하고 있습니다.';
    case 'finalizing':
      return '저장된 상세페이지 이미지를 확인하고 있습니다.';
    case 'loading':
    default:
      return '쿠팡 WING 등록을 준비하고 있습니다.';
  }
}
