import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { SkipAuth } from '../../../../auth/decorators/skip-auth.decorator';
import {
  AgentApiCapabilityGrantGuard,
  type AgentApiCapabilityRequest,
} from '../../../../agent-os/adapter/in/http/agent-api-capability-grant.guard';
import {
  SOURCING_COLLECTION_OPERATION_PORT,
  type SourcingCollectionOperationPort,
} from '../../../application/port/out/cross-domain/sourcing-collection-operation.port';

const InternalSourcingCollectionCommand = z
  .object({
    sources: z
      .array(z.enum(['naver', '1688', 'shorts']))
      .min(1)
      .max(3)
      .refine((sources) => new Set(sources).size === sources.length),
  })
  .strict();

@Controller('internal/agent-os/sourcing/collection')
export class InternalSourcingCollectionController {
  constructor(
    @Inject(SOURCING_COLLECTION_OPERATION_PORT)
    private readonly collections: SourcingCollectionOperationPort,
  ) {}

  @Post()
  @SkipAuth()
  @UseGuards(AgentApiCapabilityGrantGuard)
  async start(
    @Req() request: AgentApiCapabilityRequest,
    @Body() body: unknown,
  ): Promise<{ operationRunId: string; status: string }> {
    const parsed = InternalSourcingCollectionCommand.safeParse(body);
    const principal = request.agentApiCapabilityPrincipal;
    if (!parsed.success || !principal) {
      throw new BadRequestException('invalid_sourcing_collection_command');
    }
    const sources = [...parsed.data.sources].sort() as Array<
      'naver' | '1688' | 'shorts'
    >;
    return this.collections.startCollection({
      organizationId: principal.organizationId,
      requestedByUserId: principal.requestedByUserId,
      sources,
      idempotencyKey: [
        principal.organizationId,
        principal.requestId,
        'sourcing.refreshCollection',
        sources.join(','),
      ].join(':'),
    });
  }
}
