import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { OperationCatalogResponse } from '@kiditem/shared/operations';
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
      items: this.registry.listDefinitions()
        .filter((definition) => definition.successPersistence !== 'ephemeral_on_success')
        .map((definition) => ({
          key: definition.key,
          version: definition.version,
          title: definition.title,
          ownerDomain: definition.ownerDomain,
          engineType: definition.engineType,
          resourceClass: definition.resourceClass,
          executionTimeoutMs: definition.executionTimeoutMs,
          scheduleSupported: definition.scheduleSupported,
        })),
    } satisfies OperationCatalogResponse;
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

  @Get(':operationKey/runs/reconnect')
  findReconnectable(
    @Param('operationKey') operationKey: string,
    @Query('input') rawInput: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runner.findReconnectable({
      organizationId,
      requestedByUserId: user.id,
      operationKey,
      input: parseReconnectInput(rawInput),
    }).then((run) => ({ run }));
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

function parseReconnectInput(rawInput: string | undefined): Record<string, unknown> | undefined {
  if (rawInput === undefined) return undefined;
  if (!rawInput || rawInput.length > 8_192) {
    throw new BadRequestException('invalid_operation_reconnect_input');
  }
  try {
    const parsed: unknown = JSON.parse(rawInput);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new BadRequestException('invalid_operation_reconnect_input');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('invalid_operation_reconnect_input');
  }
}
