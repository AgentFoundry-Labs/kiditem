import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_API_CAPABILITY_GRANT_TTL_MS,
  AgentApiCapabilityGrantService,
  type AgentApiCapabilityGrantClaims,
} from '../agent-api-capability-grant.service';

const SECRET = '0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-08-13T01:00:00.000Z');
const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const REQUEST_ID = 'b282952f-d786-4c91-b59d-835d48351697';
const RUN_ID = 'b7c099b4-cf56-47ae-a553-23e65e5f263f';
const AGENT_ID = '8278f068-d6a1-44bf-b3cb-683cd48020b7';
const USER_ID = 'db7ad707-1470-44fe-be63-0df1d0f66411';
const NONCE = '13ddbfe8-4c00-4bd8-801c-81f1268ce2bb';

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    organizationId: ORG_ID,
    agentInstanceId: AGENT_ID,
    status: 'claimed',
    latestRunId: RUN_ID,
    requestedByUserId: USER_ID,
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    organizationId: ORG_ID,
    requestId: REQUEST_ID,
    agentInstanceId: AGENT_ID,
    status: 'running',
    finishedAt: null,
    ...overrides,
  };
}

function repository(
  requestRecord: ReturnType<typeof request> | null = request(),
  runRecord: ReturnType<typeof run> | null = run(),
) {
  return {
    findRunRequestById: vi.fn().mockResolvedValue(requestRecord),
    findRunById: vi.fn().mockResolvedValue(runRecord),
  };
}

function service(
  repo = repository(),
  secret: string | undefined = SECRET,
) {
  return new AgentApiCapabilityGrantService(
    repo as never,
    secret,
    () => NOW,
    () => NONCE,
  );
}

function issue(grants = service()): string {
  return grants.issue({
    organizationId: ORG_ID,
    requestId: REQUEST_ID,
    runId: RUN_ID,
    agentInstanceId: AGENT_ID,
  });
}

function resign(claims: AgentApiCapabilityGrantClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString(
    'base64url',
  );
  const signature = createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function claimsFrom(token: string): AgentApiCapabilityGrantClaims {
  return JSON.parse(
    Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'),
  ) as AgentApiCapabilityGrantClaims;
}

describe('AgentApiCapabilityGrantService', () => {
  it('issues and authorizes an explicitly selected shadow-collection capability only', async () => {
    const repo = repository();
    const grants = service(repo);
    const token = grants.issue({
      organizationId: ORG_ID,
      requestId: REQUEST_ID,
      runId: RUN_ID,
      agentInstanceId: AGENT_ID,
      capabilities: ['sourcing.collect_shadow_signals'],
    } as never);

    expect(claimsFrom(token).capabilities).toEqual([
      'sourcing.collect_shadow_signals',
    ]);
    await expect(grants.verifyAndAuthorize({
      token,
      capability: 'sourcing.collect_shadow_signals' as never,
      now: NOW,
    })).resolves.toMatchObject({ organizationId: ORG_ID });
    await expect(grants.verifyAndAuthorize({
      token,
      capability: 'sourcing.refreshCollection',
      now: NOW,
    })).rejects.toThrow('agent_api_capability_grant_invalid');
  });

  it('issues a fixed-order two-minute grant and authorizes the persisted active tuple', async () => {
    const repo = repository();
    const grants = service(repo);
    const token = issue(grants);
    const payload = Buffer.from(token.split('.')[0]!, 'base64url').toString(
      'utf8',
    );

    expect(payload).toBe(
      JSON.stringify({
        version: 1,
        audience: 'kiditem-api-operation-command',
        organizationId: ORG_ID,
        requestId: REQUEST_ID,
        runId: RUN_ID,
        agentInstanceId: AGENT_ID,
        capabilities: ['sourcing.refreshCollection'],
        issuedAt: NOW.getTime(),
        expiresAt: NOW.getTime() + AGENT_API_CAPABILITY_GRANT_TTL_MS,
        nonce: NONCE,
      }),
    );

    await expect(
      grants.verifyAndAuthorize({
        token,
        capability: 'sourcing.refreshCollection',
        now: new Date(NOW.getTime() + AGENT_API_CAPABILITY_GRANT_TTL_MS - 1),
      }),
    ).resolves.toEqual({
      organizationId: ORG_ID,
      requestId: REQUEST_ID,
      runId: RUN_ID,
      agentInstanceId: AGENT_ID,
      requestedByUserId: USER_ID,
    });
    expect(repo.findRunRequestById).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      requestId: REQUEST_ID,
    });
    expect(repo.findRunById).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      runId: RUN_ID,
    });
  });

  it.each([
    ['forged signature', (token: string) => `${token.slice(0, -1)}A`],
    ['wrong-length signature', (token: string) => `${token.split('.')[0]}.AA`],
    ['malformed token', () => 'not-a-token'],
    ['malformed base64url', (token: string) => `${token.split('.')[0]}=.AA`],
    ['oversized payload', () => `${'a'.repeat(5_000)}.AA`],
  ])('rejects %s before repository authorization', async (_label, mutate) => {
    const repo = repository();
    const grants = service(repo);
    await expect(
      grants.verifyAndAuthorize({
        token: mutate(issue(grants)),
        capability: 'sourcing.refreshCollection',
        now: NOW,
      }),
    ).rejects.toThrow('agent_api_capability_grant_invalid');
    expect(repo.findRunRequestById).not.toHaveBeenCalled();
    expect(repo.findRunById).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { issuedAt: NOW.getTime() - AGENT_API_CAPABILITY_GRANT_TTL_MS, expiresAt: NOW.getTime() }],
    ['future-issued', { issuedAt: NOW.getTime() + 1, expiresAt: NOW.getTime() + 1 + AGENT_API_CAPABILITY_GRANT_TTL_MS }],
    ['wrong ttl', { issuedAt: NOW.getTime(), expiresAt: NOW.getTime() + AGENT_API_CAPABILITY_GRANT_TTL_MS + 1 }],
    ['wrong audience', { audience: 'wrong-audience' }],
    ['wrong capability', { capabilities: ['sourcing.otherCapability'] }],
  ])('rejects a correctly signed %s claim before repository authorization', async (_label, patch) => {
    const repo = repository();
    const grants = service(repo);
    const token = issue(grants);
    const claims = { ...claimsFrom(token), ...patch } as AgentApiCapabilityGrantClaims;

    await expect(
      grants.verifyAndAuthorize({
        token: resign(claims),
        capability: 'sourcing.refreshCollection',
        now: NOW,
      }),
    ).rejects.toThrow('agent_api_capability_grant_invalid');
    expect(repo.findRunRequestById).not.toHaveBeenCalled();
  });

  it.each([
    ['missing request', null, run()],
    ['request organization', request({ organizationId: 'other' }), run()],
    ['request agent', request({ agentInstanceId: 'other' }), run()],
    ['request status', request({ status: 'pending' }), run()],
    ['request latest run', request({ latestRunId: 'other' }), run()],
    ['missing run', request(), null],
    ['run organization', request(), run({ organizationId: 'other' })],
    ['run request', request(), run({ requestId: 'other' })],
    ['run agent', request(), run({ agentInstanceId: 'other' })],
    ['run status', request(), run({ status: 'succeeded' })],
    ['run finished timestamp', request(), run({ finishedAt: NOW })],
  ])('rejects persisted tuple boundary: %s', async (_label, requestRecord, runRecord) => {
    const grants = service(repository(requestRecord, runRecord));
    await expect(
      grants.verifyAndAuthorize({
        token: issue(grants),
        capability: 'sourcing.refreshCollection',
        now: NOW,
      }),
    ).rejects.toThrow('agent_api_capability_grant_unauthorized');
  });

  it('rejects any requested capability outside the exact one-element allowlist', async () => {
    const grants = service();
    await expect(
      grants.verifyAndAuthorize({
        token: issue(grants),
        capability: 'sourcing.refreshValidation' as never,
        now: NOW,
      }),
    ).rejects.toThrow('agent_api_capability_grant_invalid');
  });

  it.each(['', 'short-secret', '가'.repeat(10)])(
    'requires a configured secret of at least 32 UTF-8 bytes (%s)',
    (secret) => {
      expect(() => issue(service(repository(), secret))).toThrow(
        'agent_api_capability_grant_secret_invalid',
      );
    },
  );

  it('does not fall back to a key when the secret is absent', () => {
    const previous = process.env.AGENT_API_CAPABILITY_GRANT_SECRET;
    delete process.env.AGENT_API_CAPABILITY_GRANT_SECRET;
    try {
      const grants = new AgentApiCapabilityGrantService(repository() as never);
      expect(() => issue(grants)).toThrow(
        'agent_api_capability_grant_secret_invalid',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_API_CAPABILITY_GRANT_SECRET;
      } else {
        process.env.AGENT_API_CAPABILITY_GRANT_SECRET = previous;
      }
    }
  });
});
