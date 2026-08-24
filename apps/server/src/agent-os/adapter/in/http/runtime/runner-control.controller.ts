import { Body, ConflictException, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  RunnerEventBatchSchema,
  RunnerPollRequestSchema,
  type RunnerEventBatch,
  type RunnerPollRequest,
} from '@kiditem/shared/agent-runtime';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import { RunnerEventHandlerService } from '../../../out/runtime/runner/runner-event-handler.service';
import { RunnerInstallationTokenService } from '../../../out/runtime/runner/runner-installation-token.service';
import { RunnerLeaseRegistry } from '../../../out/runtime/runner/runner-lease.registry';

/** Dedicated loopback control ingress; it never uses a browser session. */
@SkipAuth()
@SkipThrottle()
@Controller('internal/agent-runtime/runner')
export class RunnerControlController {
  constructor(
    private readonly installation: RunnerInstallationTokenService,
    private readonly leases: RunnerLeaseRegistry,
    private readonly eventsHandler: RunnerEventHandlerService,
  ) {}

  @Post('commands:poll')
  async poll(@Body() body: unknown, @Req() request: Request, @Res() response: Response): Promise<void> {
    this.requireInstallationBearer(request);
    const input = RunnerPollRequestSchema.parse(body);
    try {
      if (input.kind === 'hello') {
        response.status(200).json(this.leases.hello(input));
        return;
      }
      const batch = await this.leases.poll(input);
      if (!batch.commands.length) {
        response.status(204).end();
        return;
      }
      response.status(200).json(batch);
    } catch (error) {
      throw controlError(error);
    }
  }

  @Post('events')
  async events(@Body() body: unknown, @Req() request: Request, @Res() response: Response): Promise<void> {
    this.requireInstallationBearer(request);
    const batch = RunnerEventBatchSchema.parse(body) as RunnerEventBatch;
    try {
      response.status(200).json(await this.eventsHandler.handle(batch));
    } catch (error) {
      throw controlError(error);
    }
  }

  private requireInstallationBearer(request: Request): void {
    const token = bearer(request);
    if (!token || !this.installation.authenticate(token)) throw new UnauthorizedException('runner_auth_invalid');
  }
}

function bearer(request: Pick<Request, 'headers'>): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function controlError(error: unknown): Error {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('conflict')) return new ConflictException('runner_control_conflict');
  if (code.includes('lease') || code.includes('auth')) return new UnauthorizedException('runner_control_invalid');
  return error instanceof Error ? error : new Error('runner_control_invalid');
}
