import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PanelSseClient } from '../panel-sse-client';

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }));

describe('PanelSseClient', () => {
  let fetchEventSource: any;

  beforeEach(async () => {
    fetchEventSource = (await import('@microsoft/fetch-event-source')).fetchEventSource;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes x-dev-user-id header when env set', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', 'dev-user-uuid');
    const client = new PanelSseClient({ onMessage: vi.fn() });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/panel/stream'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-dev-user-id': 'dev-user-uuid' }),
      }),
    );
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
        visibility: 'company', createdAt: '2026-04-15T00:00:00Z',
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
});
