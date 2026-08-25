import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { ZodError } from 'zod';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import {
  GatewayCommandQueue,
  GatewayRuntimeTrainError,
  GatewaySessionMismatchError,
} from '../../../out/runtime/gateway/gateway-command.queue';
import { GatewayEventHandlerService, GatewayEventSequenceError } from '../../../out/runtime/gateway/gateway-event-handler.service';
import {
  GatewayInstallationBearerService,
  GatewayInstallationUnauthorizedError,
  GatewayInstallationUnavailableError,
} from '../../../out/runtime/gateway/gateway-installation-bearer.service';
import { GatewayReadinessService } from '../../../out/runtime/gateway/gateway-readiness.service';
import { GatewayPollSchema, type GatewayEventBatch } from '@kiditem/shared/agent-runtime';

/** Private Gateway control ingress. Installation-bearer validation replaces browser authentication. */
@SkipAuth()
@SkipThrottle()
@Controller('internal/agent-runtime/gateway')
export class GatewayControlController {
  constructor(
    private readonly bearer: GatewayInstallationBearerService,
    private readonly commands: GatewayCommandQueue,
    private readonly events: GatewayEventHandlerService,
    private readonly readiness: GatewayReadinessService,
  ) {}

  @Post('commands:poll')
  async poll(
    @Body() body: unknown,
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<{ commands: unknown[] }> {
    try {
      this.bearer.require(request.headers);
      const poll = GatewayPollSchema.parse(body);
      if (this.commands.claim(poll.gatewayInstanceId)) this.readiness.clear();
      const signal = abortSignal(request, response);
      try {
        return await this.commands.poll(poll, signal);
      } finally {
        if (signal.aborted) {
          this.commands.disconnect(poll.gatewayInstanceId);
          this.readiness.clear(poll.gatewayInstanceId);
        }
      }
    } catch (error) {
      throw controlHttpError(error);
    }
  }

  @Post('events')
  async event(
    @Body() body: GatewayEventBatch,
    @Req() request: Pick<ExpressRequest, 'headers'>,
  ): Promise<{ eventSeq: number; accepted: true }> {
    try {
      this.bearer.require(request.headers);
      return this.events.handle(body);
    } catch (error) {
      throw controlHttpError(error);
    }
  }
}

function abortSignal(request: ExpressRequest, response: ExpressResponse): AbortSignal {
  const abort = new AbortController();
  request.once?.('aborted', () => abort.abort());
  response.once?.('close', () => {
    if (!response.writableEnded) abort.abort();
  });
  return abort.signal;
}

function controlHttpError(error: unknown): Error {
  if (error instanceof GatewayInstallationUnavailableError) return new ServiceUnavailableException('gateway_installation_unavailable');
  if (error instanceof GatewayInstallationUnauthorizedError) return new UnauthorizedException('gateway_installation_unauthorized');
  if (error instanceof GatewaySessionMismatchError || error instanceof GatewayRuntimeTrainError || error instanceof GatewayEventSequenceError) {
    return new ConflictException('gateway_control_session_invalid');
  }
  if (error instanceof ZodError) return new BadRequestException('gateway_control_request_invalid');
  return error instanceof Error ? error : new BadRequestException('gateway_control_request_invalid');
}
