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
import {
  AgentApiCapabilityGrantService,
  type AgentApiCapabilityPrincipal,
} from '../../../../../agent-os/application/service/agent-api-capability-grant.service';
import { OperationLifecycleGateService } from '../../../../../operations/application/service/operation-lifecycle-gate.service';
import { OperationRunService } from '../../../../../operations/application/service/operation-run.service';
import { SourcingCollectionOperationAdapter } from '../../../out/operations/sourcing-collection-operation.adapter';
import { InternalSourcingCollectionController } from '../internal-sourcing-collection.controller';

const PRINCIPAL: AgentApiCapabilityPrincipal = {
  organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
  requestId: 'b282952f-d786-4c91-b59d-835d48351697',
  runId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
  agentInstanceId: '8278f068-d6a1-44bf-b3cb-683cd48020b7',
  requestedByUserId: 'db7ad707-1470-44fe-be63-0df1d0f66411',
};
const SECRET = '0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-08-13T01:00:00.000Z');
const OPERATION_RUN_ID = '5a13e4ab-9dc2-48c4-8b7a-f0b824960aa1';

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

  it('creates zero rows during bootstrap and one idempotent run after a signed command is accepted', async () => {
    const agentRepository = {
      findRunRequestById: vi.fn().mockResolvedValue({
        id: PRINCIPAL.requestId,
        organizationId: PRINCIPAL.organizationId,
        agentInstanceId: PRINCIPAL.agentInstanceId,
        status: 'claimed',
        latestRunId: PRINCIPAL.runId,
        requestedByUserId: PRINCIPAL.requestedByUserId,
      }),
      findRunById: vi.fn().mockResolvedValue({
        id: PRINCIPAL.runId,
        organizationId: PRINCIPAL.organizationId,
        requestId: PRINCIPAL.requestId,
        agentInstanceId: PRINCIPAL.agentInstanceId,
        status: 'running',
        finishedAt: null,
      }),
    };
    const grants = new AgentApiCapabilityGrantService(
      agentRepository as never,
      SECRET,
      () => NOW,
      () => '13ddbfe8-4c00-4bd8-801c-81f1268ce2bb',
    );
    const token = grants.issue({
      organizationId: PRINCIPAL.organizationId,
      requestId: PRINCIPAL.requestId,
      runId: PRINCIPAL.runId,
      agentInstanceId: PRINCIPAL.agentInstanceId,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const guard = new AgentApiCapabilityGrantGuard(grants);
    await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never);

    const definition = {
      key: 'sourcing.collect_daily_trends',
      version: 1,
      title: 'Daily sourcing collection',
      ownerDomain: 'sourcing',
      engineType: 'composite',
      resourceClass: 'default',
      executionTimeoutMs: 900_000,
      allowedTriggers: ['agent'],
      maxAttempts: 3,
    };
    let persisted: Record<string, unknown> | null = null;
    const operationRepository = {
      findByIdempotencyKey: vi.fn().mockImplementation(async () => persisted),
      createRun: vi.fn().mockImplementation(async (input) => {
        persisted = {
          ...input,
          id: OPERATION_RUN_ID,
          status: 'queued',
          result: null,
          progress: null,
          stage: null,
          stageUpdatedAt: null,
          progressCurrent: null,
          progressTotal: null,
          deadlineAt: null,
          nativeRunType: null,
          nativeRunId: null,
          attempts: 0,
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          requestedBy: null,
        };
        return persisted;
      }),
    };
    const gate = new OperationLifecycleGateService();
    const runner = new OperationRunService(
      {
        getDefinition: vi.fn().mockReturnValue(definition),
        parseInput: vi.fn((_key, input) => input),
      } as never,
      operationRepository as never,
      { cancelChildren: vi.fn() } as never,
      gate,
    );
    const controller = new InternalSourcingCollectionController(
      new SourcingCollectionOperationAdapter(runner),
    );

    await expect(
      controller.start(request as never, { sources: ['naver', '1688'] }),
    ).rejects.toMatchObject({ status: 503 });
    expect(operationRepository.createRun).not.toHaveBeenCalled();

    gate.open();
    await expect(
      controller.start(request as never, { sources: ['naver', '1688'] }),
    ).resolves.toEqual({ operationRunId: OPERATION_RUN_ID, status: 'queued' });
    await expect(
      controller.start(request as never, { sources: ['1688', 'naver'] }),
    ).resolves.toEqual({ operationRunId: OPERATION_RUN_ID, status: 'queued' });
    expect(operationRepository.createRun).toHaveBeenCalledTimes(1);
    expect(operationRepository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: PRINCIPAL.organizationId,
        requestedByUserId: PRINCIPAL.requestedByUserId,
        idempotencyKey: `${PRINCIPAL.organizationId}:${PRINCIPAL.requestId}:sourcing.refreshCollection:1688,naver`,
      }),
    );
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
