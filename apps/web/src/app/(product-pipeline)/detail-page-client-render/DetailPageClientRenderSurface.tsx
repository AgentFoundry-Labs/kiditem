'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DetailPageClientRenderDocumentResponseSchema } from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import {
  isRenderIntentId,
  sanitizeClientRenderDocument,
  waitForRenderDocument,
  waitForRenderTurn,
} from './render-document';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; source: string; revisionId: string; outputWidth: number }
  | { status: 'error'; message: string };

const MARKERS = [
  'kiditemRenderStatus',
  'kiditemIntentId',
  'kiditemRevisionId',
  'kiditemContentWidth',
  'kiditemContentHeight',
] as const;

export function DetailPageClientRenderSurface() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get('intentId');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    clearMarkers();
    document.documentElement.dataset.kiditemRenderStatus = 'loading';
    if (!isRenderIntentId(intentId)) {
      document.documentElement.dataset.kiditemRenderStatus = 'error';
      setLoadState({ status: 'error', message: '유효한 렌더 요청 ID가 필요합니다.' });
      return clearMarkers;
    }

    let cancelled = false;
    void apiClient
      .getParsed(
        `/api/ai/detail-page-image/render-intents/${intentId}/document`,
        DetailPageClientRenderDocumentResponseSchema,
      )
      .then((response) => {
        if (cancelled) return;
        setLoadState({
          status: 'ready',
          source: sanitizeClientRenderDocument(response.html),
          revisionId: response.revisionId,
          outputWidth: response.outputWidth,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        document.documentElement.dataset.kiditemRenderStatus = 'error';
        setLoadState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : '상세페이지 렌더 문서를 불러오지 못했습니다.',
        });
      });

    return () => {
      cancelled = true;
      clearMarkers();
    };
  }, [intentId]);

  const frameStyle = useMemo(
    () => ({
      border: 0,
      display: 'block',
      height: '1px',
      margin: 0,
      padding: 0,
      width: '720px',
    }),
    [],
  );

  const markReady = useCallback(async () => {
    if (!isRenderIntentId(intentId) || loadState.status !== 'ready') return;
    const frame = iframeRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) {
      document.documentElement.dataset.kiditemRenderStatus = 'error';
      return;
    }
    try {
      const height = await waitForRenderDocument(frameDocument);
      frame.style.height = `${height}px`;
      await waitForRenderTurn();
      const root = document.documentElement.dataset;
      root.kiditemIntentId = intentId;
      root.kiditemRevisionId = loadState.revisionId;
      root.kiditemContentWidth = '720';
      root.kiditemContentHeight = String(height);
      root.kiditemRenderStatus = 'ready';
    } catch (error) {
      document.documentElement.dataset.kiditemRenderStatus = 'error';
      setLoadState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : '상세페이지 이미지 준비에 실패했습니다.',
      });
    }
  }, [intentId, loadState]);

  if (loadState.status === 'loading') {
    return <main style={messageStyle}>상세페이지 이미지를 준비하고 있습니다.</main>;
  }
  if (loadState.status === 'error') {
    return <main style={messageStyle}>{loadState.message}</main>;
  }

  return (
    <iframe
      ref={iframeRef}
      title="KidItem detail page client renderer"
      sandbox="allow-same-origin"
      srcDoc={loadState.source}
      style={frameStyle}
      onLoad={() => void markReady()}
    />
  );
}

function clearMarkers() {
  for (const marker of MARKERS) delete document.documentElement.dataset[marker];
}

const messageStyle = {
  alignItems: 'center',
  background: '#ffffff',
  color: '#111827',
  display: 'flex',
  fontFamily: 'sans-serif',
  fontSize: '14px',
  height: '100vh',
  justifyContent: 'center',
  margin: 0,
  width: '720px',
} as const;
