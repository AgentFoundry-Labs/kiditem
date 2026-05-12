import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AlertItem } from '@kiditem/shared/alerts';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { OperationAlertService } from '../../../application/service/operation-alert.service';
import type { OperationLifecyclePatch } from '../../../application/port/in/operation-alert.port';
import { mapAlertRowToItem } from '../../../mapper/alert-item.mapper';
import {
  isBrowserOperationProducer,
  resolveBrowserOperationProducer,
} from '../../../domain/policy/browser-operation-producers';
import {
  StartOperationAlertDto,
  UpdateOperationAlertDto,
} from './dto/alerts';

/**
 * Frontend-facing entrypoint for `Alert.kind='operation'` lifecycle when
 * the producing work happens in the browser (extension scrapes,
 * browser-orchestrated long-running flows). Server-side producers
 * (`RulesService`, `ThumbnailGenerationSinkAdapter`, etc.) call
 * `OperationAlertService` directly and do NOT use these endpoints.
 *
 * Tenancy: `organizationId` and `actorUserId` are derived from the auth
 * decorators. Any client-supplied tenant fields are silently dropped by
 * the global `ValidationPipe` whitelist (DTOs do not declare them).
 *
 * Idempotency: `start` is keyed on `(organizationId, operationKey)` —
 * re-running with the same key reuses the row (running) rather than
 * creating a duplicate. PATCH transitions are no-op (404) if no row
 * exists; producers that lost their start call must not silently
 * synthesise one from a closing call (see `OperationAlertService`).
 */
@Controller('operation-alerts')
export class OperationAlertLifecycleController {
  constructor(private readonly operationAlerts: OperationAlertService) {}

  @Post('start')
  @HttpCode(200)
  async start(
    @Body() dto: StartOperationAlertDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AlertItem> {
    const producer = resolveBrowserOperationProducer(dto);
    if (!producer) {
      throw new BadRequestException('unsupported operation alert producer');
    }

    const alert = await this.operationAlerts.start({
      organizationId,
      operationKey: dto.operationKey,
      type: dto.type,
      title: producer.title,
      message: dto.message ?? null,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId ?? null,
      actorUserId: user.id,
      href: producer.href,
      severity: dto.severity,
      progress: dto.progress ?? null,
      metadata: dto.metadata,
    });
    return mapAlertRowToItem(alert);
  }

  @Patch(':operationKey')
  async update(
    @Param('operationKey') operationKey: string,
    @Body() dto: UpdateOperationAlertDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AlertItem> {
    const existing = await this.operationAlerts.findByOperationKey(
      organizationId,
      operationKey,
    );
    if (
      !existing ||
      existing.actorUserId !== user.id ||
      !isBrowserOperationProducer(existing.type, existing.sourceType)
    ) {
      throw new NotFoundException(
        `operation alert not found: ${operationKey}`,
      );
    }

    const patch: OperationLifecyclePatch = {
      message: dto.message,
      href: dto.href,
      progress: dto.progress,
      severity: dto.severity,
      metadata: dto.metadata,
    };

    const alert = await this.dispatch(
      organizationId,
      operationKey,
      dto.status,
      patch,
    );
    if (!alert) {
      throw new NotFoundException(
        `operation alert not found: ${operationKey}`,
      );
    }
    return mapAlertRowToItem(alert);
  }

  private async dispatch(
    organizationId: string,
    operationKey: string,
    status: UpdateOperationAlertDto['status'],
    patch: OperationLifecyclePatch,
  ) {
    switch (status) {
      case 'running':
        return this.operationAlerts.progress(
          organizationId,
          operationKey,
          patch,
        );
      case 'succeeded':
        return this.operationAlerts.succeed(
          organizationId,
          operationKey,
          patch,
        );
      case 'failed':
        return this.operationAlerts.fail(
          organizationId,
          operationKey,
          patch,
        );
      case 'cancelled':
        return this.operationAlerts.cancel(
          organizationId,
          operationKey,
          patch,
        );
    }
  }
}
