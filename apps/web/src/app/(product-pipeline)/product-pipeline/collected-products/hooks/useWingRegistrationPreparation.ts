'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  prepareWingRegistration,
  type WingRegistrationPreparationPhase,
  type WingRegistrationDraft,
} from '../lib/wing-registration-flow';

interface WingRegistrationPreparationCallbacks {
  onReady: (draft: WingRegistrationDraft) => void;
  onError: (message: string) => void;
}

interface PreparationAttempt {
  /** 수집상품 화면의 판매상품 초안 id(KID-310). */
  salesProductId: string;
  sequence: number;
}

const PREPARATION_ERROR_FALLBACK = '쿠팡 WING 등록 준비에 실패했습니다.';

function preparationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : PREPARATION_ERROR_FALLBACK;
}

export function useWingRegistrationPreparation(
  callbacks: WingRegistrationPreparationCallbacks,
) {
  const [attempt, setAttempt] = useState<PreparationAttempt | null>(null);
  const [renderPhase, setRenderPhase] = useState<WingRegistrationPreparationPhase | null>(null);
  const sequence = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const query = useQuery({
    queryKey: [
      'wing-registration-preparation',
      attempt?.salesProductId ?? null,
      attempt?.sequence ?? 0,
    ],
    queryFn: () => prepareWingRegistration(attempt!.salesProductId, undefined, {
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
      callbacksRef.current.onError(
        query.data.message.trim() || PREPARATION_ERROR_FALLBACK,
      );
      setRenderPhase(null);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
      return;
    }
    if (query.error) {
      callbacksRef.current.onError(preparationErrorMessage(query.error));
      setRenderPhase(null);
      setAttempt((current) =>
        current?.sequence === attempt.sequence ? null : current,
      );
    }
  }, [attempt, query.data, query.error]);

  const start = useCallback((salesProductId: string) => {
    sequence.current += 1;
    setRenderPhase('loading');
    setAttempt({ salesProductId, sequence: sequence.current });
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

function renderPhaseMessage(phase: WingRegistrationPreparationPhase | null): string {
  switch (phase) {
    case 'rendering':
      return '서버에서 상세페이지 이미지를 생성하고 있습니다.';
    case 'finalizing':
      return '생성된 상세페이지 이미지와 Wing 등록 정보를 확인하고 있습니다.';
    case 'loading':
    default:
      return '쿠팡 WING 등록을 준비하고 있습니다.';
  }
}
