import 'reflect-metadata';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { SKIP_AUTH_KEY } from '../../../../../auth/decorators/skip-auth.decorator';
import { AgentApiShadowCapabilityGrantGuard } from '../../../../../agent-os/adapter/in/http/agent-api-shadow-capability-grant.guard';
import type { AgentApiCapabilityPrincipal } from '../../../../../agent-os/application/service/agent-api-capability-grant.service';
import { InternalMarketShadowOperationController } from '../internal-market-shadow-operation.controller';

const PRINCIPAL: AgentApiCapabilityPrincipal = {
  organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
  requestId: 'b282952f-d786-4c91-b59d-835d48351697',
  runId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
  agentInstanceId: '8278f068-d6a1-44bf-b3cb-683cd48020b7',
  requestedByUserId: 'db7ad707-1470-44fe-be63-0df1d0f66411',
};

describe('InternalMarketShadowOperationController', () => {
  it('accepts only an exact shadow grant route and derives the operation input from its verified principal', async () => {
    const operations = {
      startShadowCollection: vi.fn().mockResolvedValue({
        operationRunId: '5a13e4ab-9dc2-48c4-8b7a-f0b824960aa1',
        status: 'queued',
      }),
    };
    const controller = new InternalMarketShadowOperationController(
      operations as never,
    );
    const method = InternalMarketShadowOperationController.prototype.start;

    expect(Reflect.getMetadata(PATH_METADATA, InternalMarketShadowOperationController))
      .toBe('internal/agent-os/sourcing/shadow-collection');
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(SKIP_AUTH_KEY, method)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AgentApiShadowCapabilityGrantGuard,
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(
      HttpStatus.ACCEPTED,
    );

    await expect(controller.start(
      { agentApiCapabilityPrincipal: PRINCIPAL } as never,
      {},
    )).resolves.toEqual({
      operationRunId: '5a13e4ab-9dc2-48c4-8b7a-f0b824960aa1',
      status: 'queued',
    });
    expect(operations.startShadowCollection).toHaveBeenCalledOnce();
    expect(operations.startShadowCollection).toHaveBeenCalledWith({
      organizationId: PRINCIPAL.organizationId,
      requestedByUserId: PRINCIPAL.requestedByUserId,
      triggerSource: 'agent',
      idempotencyKey: `${PRINCIPAL.organizationId}:${PRINCIPAL.requestId}:sourcing.collect_shadow_signals`,
    });
  });

  it.each([
    { organizationId: 'forged' },
    { requestedByUserId: 'forged' },
    { idempotencyKey: 'forged' },
  ])('rejects client-controlled operation identity: %j', async (body) => {
    const operations = { startShadowCollection: vi.fn() };
    const controller = new InternalMarketShadowOperationController(
      operations as never,
    );

    await expect(controller.start(
      { agentApiCapabilityPrincipal: PRINCIPAL } as never,
      body,
    )).rejects.toThrow('invalid_market_shadow_operation_command');
    expect(operations.startShadowCollection).not.toHaveBeenCalled();
  });
});
