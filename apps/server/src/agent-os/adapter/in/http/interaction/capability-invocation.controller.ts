import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentOsError } from '../../../../domain/agent-os.errors';
import {
  CAPABILITY_APPROVAL_PORT,
  CAPABILITY_INVOCATION_PORT,
  type CapabilityApprovalPort,
  type CapabilityInvocationPort,
} from '../../../../application/port/in/capability/capability-invocation.port';

const InvocationParamsSchema = z.object({ invocationId: z.string().uuid() }).strict();
const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1_000).optional(),
}).strict();

/** Same-origin approval transport; it has no public execution endpoint. */
@Controller('agent-os/invocations')
export class CapabilityInvocationController {
  constructor(
    @Inject(CAPABILITY_INVOCATION_PORT)
    private readonly invocations: CapabilityInvocationPort,
    @Inject(CAPABILITY_APPROVAL_PORT)
    private readonly approvals: CapabilityApprovalPort,
  ) {}

  @Get(':invocationId')
  async get(
    @Param('invocationId') invocationId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const parsed = parseParams({ invocationId });
    try {
      return await this.invocations.getReceipt({
        organizationId,
        invocationId: parsed.invocationId,
      });
    } catch (error) {
      rethrowInvocationError(error);
    }
  }

  @Post(':invocationId/decision')
  async decide(
    @Param('invocationId') invocationId: string,
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const params = parseParams({ invocationId });
    const decision = parseDecision(body);
    try {
      await this.approvals.decide({
        organizationId,
        userId: user.id,
        invocationId: params.invocationId,
        decision: decision.decision,
        ...(decision.reason ? { reason: decision.reason } : {}),
      });
      return await this.invocations.getReceipt({
        organizationId,
        invocationId: params.invocationId,
      });
    } catch (error) {
      rethrowInvocationError(error);
    }
  }
}

function parseParams(input: unknown) {
  const parsed = InvocationParamsSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('invocationId must be a UUID.');
  return parsed.data;
}

function parseDecision(input: unknown) {
  const parsed = DecisionSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('Invalid capability approval decision.');
  return parsed.data;
}

function rethrowInvocationError(error: unknown): never {
  if (error instanceof AgentOsError && error.code === 'CAPABILITY_NOT_FOUND') {
    throw new NotFoundException('Capability invocation was not found.');
  }
  throw error;
}
