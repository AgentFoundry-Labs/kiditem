import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { SKIP_AUTH_KEY } from '../../../../../auth/decorators/skip-auth.decorator';
import { AgentApiCapabilityGrantGuard } from '../../../../../agent-os/adapter/in/http/agent-api-capability-grant.guard';
import type { AgentApiCapabilityPrincipal } from '../../../../../agent-os/application/service/agent-api-capability-grant.service';
import { InternalSourcingCollectionController } from '../internal-sourcing-collection.controller';

const PRINCIPAL: AgentApiCapabilityPrincipal = {
  organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
  requestId: 'b282952f-d786-4c91-b59d-835d48351697',
  runId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
  agentInstanceId: '8278f068-d6a1-44bf-b3cb-683cd48020b7',
  requestedByUserId: 'db7ad707-1470-44fe-be63-0df1d0f66411',
};

describe('InternalSourcingCollectionController', () => {
  it('is hidden from global auth only together with the dedicated grant guard', () => {
    const method = InternalSourcingCollectionController.prototype.start;
    expect(Reflect.getMetadata(PATH_METADATA, InternalSourcingCollectionController)).toBe(
      'internal/agent-os/sourcing/collection',
    );
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(SKIP_AUTH_KEY, method)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AgentApiCapabilityGrantGuard,
    ]);
  });

  it('derives tenant, actor, and idempotency from the verified principal', async () => {
    const collections = {
      startCollection: vi.fn().mockResolvedValue({
        operationRunId: '5a13e4ab-9dc2-48c4-8b7a-f0b824960aa1',
        status: 'queued',
      }),
    };
    const controller = new InternalSourcingCollectionController(
      collections as never,
    );

    await expect(
      controller.start(
        { agentApiCapabilityPrincipal: PRINCIPAL } as never,
        { sources: ['naver', '1688'] },
      ),
    ).resolves.toEqual({
      operationRunId: '5a13e4ab-9dc2-48c4-8b7a-f0b824960aa1',
      status: 'queued',
    });
    expect(collections.startCollection).toHaveBeenCalledWith({
      organizationId: PRINCIPAL.organizationId,
      requestedByUserId: PRINCIPAL.requestedByUserId,
      sources: ['1688', 'naver'],
      idempotencyKey: `${PRINCIPAL.organizationId}:${PRINCIPAL.requestId}:sourcing.refreshCollection:1688,naver`,
    });
  });

  it.each([
    [{ sources: ['naver'], organizationId: 'forged' }],
    [{ sources: ['naver'], requestedByUserId: 'forged' }],
    [{ sources: ['naver'], idempotencyKey: 'forged' }],
    [{ sources: ['naver', 'naver'] }],
    [{ sources: [] }],
    [{ sources: ['unknown'] }],
  ])('rejects any body beyond strict unique sources: %j', async (body) => {
    const collections = { startCollection: vi.fn() };
    const controller = new InternalSourcingCollectionController(
      collections as never,
    );

    await expect(
      controller.start(
        { agentApiCapabilityPrincipal: PRINCIPAL } as never,
        body,
      ),
    ).rejects.toThrow('invalid_sourcing_collection_command');
    expect(collections.startCollection).not.toHaveBeenCalled();
  });
});

describe('AgentApiCapabilityGrantGuard', () => {
  it('authorizes only the bearer and attaches the persisted principal', async () => {
    const grants = {
      verifyAndAuthorize: vi.fn().mockResolvedValue(PRINCIPAL),
    };
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer bounded-grant' },
    };
    const guard = new AgentApiCapabilityGrantGuard(grants as never);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).resolves.toBe(true);
    expect(grants.verifyAndAuthorize).toHaveBeenCalledWith({
      token: 'bounded-grant',
      capability: 'sourcing.refreshCollection',
    });
    expect(request.agentApiCapabilityPrincipal).toBe(PRINCIPAL);
  });

  it.each([undefined, '', 'Basic value', 'Bearer ', 'Bearer one two'])(
    'rejects a missing or malformed bearer without verification (%s)',
    async (authorization) => {
      const grants = { verifyAndAuthorize: vi.fn() };
      const guard = new AgentApiCapabilityGrantGuard(grants as never);
      await expect(
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization } }),
          }),
        } as never),
      ).rejects.toThrow('agent_api_capability_grant_invalid');
      expect(grants.verifyAndAuthorize).not.toHaveBeenCalled();
    },
  );
});
