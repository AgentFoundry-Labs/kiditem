/**
 * PanelSseClient — SSE wrapper for /api/panel/stream.
 *
 * ADR-0010: fetch-event-source is authorized for Panel domain only.
 * Raw fetch() is otherwise prohibited in apps/web (see apps/web/AGENTS.md).
 *
 * Auth: connect 시점에 Supabase 세션의 access token 을 `Authorization: Bearer` 헤더로 첨부.
 * `credentials: 'include'` 도 같이 보내 추후 cookie-only 백엔드와 호환. fetchEventSource 는
 * 표준 EventSource API 와 달리 fetch() 옵션을 받으므로 헤더/credentials 둘 다 가능.
 */
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { PanelEvent } from '@kiditem/shared/panel';
import { API_BASE } from '@/lib/api';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface PanelSseClientOptions {
  onMessage: (event: PanelEvent) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Called after MAX_RETRIES consecutive failures — signal to fall back to polling. */
  onGiveUp?: () => void;
}

const MAX_RETRIES = 5;

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }

  if (typeof err !== 'object' || err === null) return false;

  const maybeError = err as { message?: unknown; name?: unknown };
  return (
    maybeError.name === 'AbortError' ||
    (typeof maybeError.message === 'string' && maybeError.message.toLowerCase().includes('aborted'))
  );
}

export class PanelSseClient {
  private controller = new AbortController();
  private lastEventId?: string;
  private retryCount = 0;

  constructor(private readonly options: PanelSseClientOptions) {}

  connect() {
    if (!this.controller.signal.aborted) this.controller.abort(); // reap prior connection if still active
    const controller = new AbortController();
    this.controller = controller;
    this.retryCount = 0;

    void Promise.resolve(this.buildHeaders()).then((headers) =>
      this.openStream(controller, headers),
    );
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.lastEventId) headers['last-event-id'] = this.lastEventId;
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // Supabase 키 미설정 환경 — 백엔드가 401 후 polling fallback 으로 떨어짐.
    }
    return headers;
  }

  private openStream(controller: AbortController, headers: Record<string, string>) {
    void Promise.resolve(
      fetchEventSource(`${API_BASE}/api/panel/stream`, {
        signal: controller.signal,
        credentials: 'include',
        headers,
        // visibility 변경 시 재연결 유도 (IMPORTANT #7)
        openWhenHidden: false,
        onmessage: (msg) => {
          if (msg.id) this.lastEventId = msg.id;
          if (!msg.data || msg.data === '') return; // ping
          try {
            const parsed = PanelEvent.parse(JSON.parse(msg.data));
            this.options.onMessage(parsed);
          } catch (err) {
            this.options.onError?.(err);
          }
        },
        onopen: async () => {
          this.retryCount = 0;
          this.options.onOpen?.();
        },
        onerror: (err) => {
          this.retryCount++;
          this.options.onError?.(err);
          if (this.retryCount > MAX_RETRIES) {
            this.options.onGiveUp?.();
            throw err; // fetch-event-source stops retrying when error is thrown
          }
          return Math.min(1000 * 2 ** this.retryCount, 30_000);
        },
        onclose: () => this.options.onClose?.(),
      }),
    ).catch((err) => {
      if (controller.signal.aborted && isAbortError(err)) return;
      this.options.onError?.(err);
    });
  }


  disconnect() {
    if (!this.controller.signal.aborted) this.controller.abort();
  }
}
