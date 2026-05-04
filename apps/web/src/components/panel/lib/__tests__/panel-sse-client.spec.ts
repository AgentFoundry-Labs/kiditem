import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PanelSseClient } from '../panel-sse-client';

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));

describe('PanelSseClient', () => {
  let fetchEventSource: any;

  beforeEach(async () => {
    fetchEventSource = (await import('@microsoft/fetch-event-source')).fetchEventSource;
    vi.clearAllMocks();
  });

  it('uses cookie-based auth (credentials: include) — Authorization header은 EventSource API 표준 한계로 첨부 못 함', async () => {
    const client = new PanelSseClient({ onMessage: vi.fn() });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/panel/stream'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
    );
    // 헤더 기반 인증 패턴(`x-dev-user-id`) 회귀 방지 — Supabase 쿠키만 사용.
    const callArgs = fetchEventSource.mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty('x-dev-user-id');
  });

  it('includes Last-Event-ID on reconnect', async () => {
    const client = new PanelSseClient({ onMessage: vi.fn() });
    (client as any).lastEventId = '42';
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'last-event-id': '42' }),
      }),
    );
  });

  it('parses valid JSON and calls onMessage', async () => {
    const onMessage = vi.fn();
    const client = new PanelSseClient({ onMessage });
    let config: any;
    fetchEventSource.mockImplementation((_url: string, cfg: any) => {
      config = cfg;
      return Promise.resolve();
    });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    config.onmessage({ id: '1', data: JSON.stringify({
      type: 'upsert', seq: 1, item: {
        id: 'x', kind: 'run', source: 'workflow', sourceId: 's', seq: 1,
        status: 'running', title: 't', deepLink: '/x', actorUserId: null,
        visibility: 'organization', createdAt: '2026-04-15T00:00:00Z',
        updatedAt: '2026-04-15T00:00:00Z',
      },
    }) });
    expect(onMessage).toHaveBeenCalled();
  });

  it('disconnect aborts', () => {
    const client = new PanelSseClient({ onMessage: vi.fn() });
    client.connect();
    client.disconnect();
    expect((client as any).controller.signal.aborted).toBe(true);
  });

  it('suppresses expected abort rejection after disconnect', async () => {
    const onError = vi.fn();
    const abortError = Object.assign(new Error('signal is aborted without reason'), {
      name: 'AbortError',
    });
    fetchEventSource.mockImplementation(() => Promise.reject(abortError));

    const client = new PanelSseClient({ onMessage: vi.fn(), onError });
    client.connect();
    client.disconnect();
    await new Promise((r) => setTimeout(r, 5));

    expect(onError).not.toHaveBeenCalled();
  });

  it('reports unexpected stream rejection', async () => {
    const onError = vi.fn();
    const streamError = new Error('stream failed');
    fetchEventSource.mockImplementation(() => Promise.reject(streamError));

    const client = new PanelSseClient({ onMessage: vi.fn(), onError });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));

    expect(onError).toHaveBeenCalledWith(streamError);
  });
});
