/**
 * PanelSseClient — SSE wrapper for /api/panel/stream.
 *
 * Panel SSE exception: fetch-event-source is authorized for Panel domain only.
 * Raw fetch() is otherwise prohibited in apps/web (see apps/web/AGENTS.md).
 *
 * Auth: `credentials: 'include'` 로 HttpOnly KidItem cookie만 전송한다.
 */
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { PanelEventSchema } from '@kiditem/shared/panel';
import type { PanelEvent } from '@kiditem/shared/panel';
import { API_BASE } from '@/lib/api';

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
            const parsed = PanelEventSchema.parse(JSON.parse(msg.data));
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
