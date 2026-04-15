/**
 * PanelSseClient — SSE wrapper for /api/panel/stream.
 *
 * ADR-0010: fetch-event-source is authorized for Panel domain only.
 * Raw fetch() is otherwise prohibited in apps/web (see apps/web/CLAUDE.md).
 */
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { PanelEvent } from '@kiditem/shared';
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

export class PanelSseClient {
  private controller = new AbortController();
  private lastEventId?: string;
  private retryCount = 0;

  constructor(private readonly options: PanelSseClientOptions) {}

  connect() {
    if (!this.controller.signal.aborted) this.controller.abort(); // reap prior connection if still active
    this.controller = new AbortController();
    this.retryCount = 0;

    // Read env at connect time so tests can stub env before connecting (Option A).
    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID;

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (devUserId) headers['x-dev-user-id'] = devUserId;
    if (this.lastEventId) headers['last-event-id'] = this.lastEventId;

    fetchEventSource(`${API_BASE}/api/panel/stream`, {
      signal: this.controller.signal,
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
    });
  }

  disconnect() {
    this.controller.abort();
  }
}
