import { describe, expect, it, vi } from 'vitest';
import { SourcingCollectionApiCommandAdapter } from '../sourcing-collection-api-command.adapter';

describe('SourcingCollectionApiCommandAdapter', () => {
  it('posts only strict sources with the bounded bearer to the internal API endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
          status: 'queued',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const adapter = new SourcingCollectionApiCommandAdapter(
      {
        KIDITEM_AGENT_OS_API_URL: 'http://api:4000/',
        KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: 'bounded-grant',
      },
      fetcher as never,
    );

    await expect(
      adapter.startCollection({
        organizationId: 'forged-org',
        requestedByUserId: 'forged-user',
        idempotencyKey: 'forged-key',
        sources: ['naver', '1688'],
      }),
    ).resolves.toEqual({
      operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
      status: 'queued',
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      'http://api:4000/api/internal/agent-os/sourcing/collection',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer bounded-grant',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sources: ['naver', '1688'] }),
      signal: expect.any(AbortSignal),
    });
    expect(init.body).not.toContain('forged-org');
    expect(init.body).not.toContain('forged-user');
    expect(init.body).not.toContain('forged-key');
  });

  it.each([
    [new Response('denied', { status: 401 })],
    [new Response('not json', { status: 200 })],
    [new Response(JSON.stringify({ operationRunId: 'not-a-uuid', status: 'queued' }), { status: 200 })],
    [new Response(JSON.stringify({ operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f' }), { status: 200 })],
  ])('rejects non-2xx or malformed responses', async (response) => {
    const adapter = new SourcingCollectionApiCommandAdapter(
      {
        KIDITEM_AGENT_OS_API_URL: 'http://api:4000',
        KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: 'bounded-grant',
      },
      vi.fn().mockResolvedValue(response) as never,
    );
    await expect(
      adapter.startCollection({
        organizationId: 'ignored',
        requestedByUserId: null,
        idempotencyKey: 'ignored',
        sources: ['naver'],
      }),
    ).rejects.toThrow('sourcing_collection_api_command_failed');
  });

  it.each([
    [{ KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: 'bounded-grant' }],
    [{ KIDITEM_AGENT_OS_API_URL: 'http://api:4000' }],
    [{ KIDITEM_AGENT_OS_API_URL: 'not-a-url', KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: 'bounded-grant' }],
  ])('fails explicitly for missing/invalid bounded command environment', async (env) => {
    const fetcher = vi.fn();
    const adapter = new SourcingCollectionApiCommandAdapter(
      env,
      fetcher as never,
    );
    await expect(
      adapter.startCollection({
        organizationId: 'ignored',
        requestedByUserId: null,
        idempotencyKey: 'ignored',
        sources: ['naver'],
      }),
    ).rejects.toThrow('sourcing_collection_api_command_not_configured');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
