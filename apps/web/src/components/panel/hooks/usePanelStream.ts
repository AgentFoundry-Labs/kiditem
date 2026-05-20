'use client';

import { useEffect } from 'react';
import type { PanelItem } from '@kiditem/shared/panel';
import { apiClient } from '@/lib/api-client';
import { PanelSseClient } from '../lib/panel-sse-client';
import { usePanelStore } from '../lib/panel-store';

const PANEL_FALLBACK_POLL_MS = 5000;

export function usePanelStream() {
  const connectionStatus = usePanelStore((s) => s.connectionStatus);

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

  useEffect(() => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      return;
    }

    let stopped = false;
    let inFlight = false;

    const pollSnapshot = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const items = await apiClient.get<PanelItem[]>('/api/panel/snapshot');
        if (stopped) return;
        usePanelStore.getState().handleSnapshot(items, true);
        if (usePanelStore.getState().connectionStatus !== 'connected') {
          usePanelStore.getState().setConnectionStatus('polling_fallback');
        }
      } catch {
        if (!stopped && usePanelStore.getState().connectionStatus !== 'connected') {
          usePanelStore.getState().setConnectionStatus('disconnected');
        }
      } finally {
        inFlight = false;
      }
    };

    void pollSnapshot();
    const timer = window.setInterval(pollSnapshot, PANEL_FALLBACK_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [connectionStatus]);
}
