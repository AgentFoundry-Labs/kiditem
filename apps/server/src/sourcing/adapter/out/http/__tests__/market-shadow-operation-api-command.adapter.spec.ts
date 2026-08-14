import { describe, expect, it, vi } from 'vitest';
import { MarketShadowOperationApiCommandAdapter } from '../market-shadow-operation-api-command.adapter';

describe('MarketShadowOperationApiCommandAdapter', () => {
  it('posts no client-controlled organization or run identity to the exact fenced internal endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
      status: 'queued',
    }), { status: 202 }));
    const adapter = new MarketShadowOperationApiCommandAdapter({
      KIDITEM_AGENT_OS_API_URL: 'http://api:4000/',
      KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: 'bounded-shadow-grant',
    }, fetcher as never);

    await expect(adapter.startShadowCollection({
      organizationId: 'forged-org',
      requestedByUserId: 'forged-user',
      triggerSource: 'agent',
      idempotencyKey: 'forged-key',
    })).resolves.toEqual({
      operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
      status: 'queued',
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'http://api:4000/api/internal/agent-os/sourcing/shadow-collection',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer bounded-shadow-grant',
        'content-type': 'application/json',
      },
      body: '{}',
      signal: expect.any(AbortSignal),
    });
  });
});
