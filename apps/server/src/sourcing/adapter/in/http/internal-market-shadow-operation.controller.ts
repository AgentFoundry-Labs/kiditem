import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { SkipAuth } from '../../../../auth/decorators/skip-auth.decorator';
import {
  type AgentApiCapabilityRequest,
} from '../../../../agent-os/adapter/in/http/agent-api-capability-grant.guard';
import { AgentApiShadowCapabilityGrantGuard } from '../../../../agent-os/adapter/in/http/agent-api-shadow-capability-grant.guard';
import {
  MARKET_SHADOW_OPERATION_PORT,
  type MarketShadowOperationPort,
} from '../../../application/port/out/cross-domain/market-shadow-operation.port';

const InternalMarketShadowOperationCommand = z.object({}).strict();

@Controller('internal/agent-os/sourcing/shadow-collection')
export class InternalMarketShadowOperationController {
  constructor(
    @Inject(MARKET_SHADOW_OPERATION_PORT)
    private readonly operations: MarketShadowOperationPort,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipAuth()
  @UseGuards(AgentApiShadowCapabilityGrantGuard)
  async start(
    @Req() request: AgentApiCapabilityRequest,
    @Body() body: unknown,
  ): Promise<{ operationRunId: string; status: string }> {
    const parsed = InternalMarketShadowOperationCommand.safeParse(body);
    const principal = request.agentApiCapabilityPrincipal;
    if (!parsed.success || !principal) {
      throw new BadRequestException('invalid_market_shadow_operation_command');
    }
    return this.operations.startShadowCollection({
      organizationId: principal.organizationId,
      requestedByUserId: principal.requestedByUserId,
      triggerSource: 'agent',
      idempotencyKey: [
        principal.organizationId,
        principal.requestId,
        'sourcing.collect_shadow_signals',
      ].join(':'),
    });
  }
}
