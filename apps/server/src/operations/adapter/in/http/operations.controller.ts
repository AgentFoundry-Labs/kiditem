import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../application/port/in/operation-handler-registry.port';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../application/port/in/operation-runner.port';
import {
  parseCreateOperationRunDto,
  parseIdempotencyKey,
} from './dto/operation-run.dto';

@Controller('operations')
export class OperationsController {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly runner: OperationRunnerPort,
  ) {}

  @Get()
  listDefinitions() {
    return {
      items: this.registry.listDefinitions().map((definition) => ({
        key: definition.key,
        version: definition.version,
        title: definition.title,
        ownerDomain: definition.ownerDomain,
        engineType: definition.engineType,
        scheduleSupported: definition.scheduleSupported,
      })),
    };
  }

  @Post(':operationKey/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  start(
    @Param('operationKey') operationKey: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const request = parseCreateOperationRunDto(body);
    return this.runner.start({
      organizationId,
      operationKey,
      triggerSource: request.sourceSurface,
      input: request.input,
      requestedByUserId: user.id,
      idempotencyKey: parseIdempotencyKey(idempotencyKey),
    });
  }

  @Get('runs')
  async listRuns(@CurrentOrganization() organizationId: string) {
    return { items: await this.runner.list({ organizationId }) };
  }

  @Get('runs/:runId')
  getRun(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.runner.get(organizationId, runId);
  }

  @Post('runs/:runId/cancel')
  cancelRun(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runner.cancel({
      organizationId,
      runId,
      requestedByUserId: user.id,
    });
  }
}
