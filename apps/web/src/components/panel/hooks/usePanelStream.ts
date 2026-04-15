'use client';

import { useEffect } from 'react';
import { PanelSseClient } from '../lib/panel-sse-client';
import { usePanelStore } from '../lib/panel-store';

export function usePanelStream() {
  useEffect(() => {
    usePanelStore.getState().setConnectionStatus('connecting');

    const client = new PanelSseClient({
      onMessage: (event) => usePanelStore.getState().applyEvent(event),
      onOpen: () => usePanelStore.getState().setConnectionStatus('connected'),
      onError: () => usePanelStore.getState().setConnectionStatus('disconnected'),
      onClose: () => usePanelStore.getState().setConnectionStatus('disconnected'),
      onGiveUp: () => {
        // 5회 재시도 실패 → polling fallback 시그널
        usePanelStore.getState().setConnectionStatus('polling_fallback');
        // 실제 폴링 로직은 선택적 (Phase 2) — MVP는 상태만 표시
      },
    });

    client.connect();
    return () => client.disconnect();
  }, []);
}
