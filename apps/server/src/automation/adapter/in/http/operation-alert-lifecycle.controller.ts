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
import { OperationAlertOwnershipConflictError } from '../../../domain/errors/operation-alert-ownership-conflict.error';
import {
  ReconcileBrowserOperationAlertsDto,
  StartOperationAlertDto,
  UpdateOperationAlertDto,
} from './dto/alerts';

const BROWSER_BATCH_OPERATION_TYPE = 'thumbnail_analysis';
const BROWSER_BATCH_SOURCE_TYPE = 'browser_batch';
const BROWSER_BATCH_STALE_MINUTES = 30;
const BROWSER_BATCH_STALE_LIMIT = 100;
const BROWSER_BATCH_STALE_MESSAGE =
  '브라우저 작업 세션이 종료되어 진행 상태를 자동 정리했습니다.';

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

    const existing = await this.operationAlerts.findByOperationKey(
      organizationId,
      dto.operationKey,
    );
    if (existing && existing.actorUserId !== user.id) {
      throw new NotFoundException(
        `operation alert not found: ${dto.operationKey}`,
      );
    }

    const alert = await this.operationAlerts
      .start({
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
      })
      .catch((error: unknown) => {
        if (error instanceof OperationAlertOwnershipConflictError) {
          throw new NotFoundException(
            `operation alert not found: ${dto.operationKey}`,
          );
        }
        throw error;
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
      !isBrowserOperationProducer({
        operationKey,
        type: existing.type,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
      })
    ) {
      throw new NotFoundException(
        `operation alert not found: ${operationKey}`,
      );
    }

    const patch: OperationLifecyclePatch = {
      message: dto.message,
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

  @Post('reconcile-browser-stale')
  @HttpCode(200)
  async reconcileBrowserStale(
    @Body() dto: ReconcileBrowserOperationAlertsDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<AlertItem[]> {
    const staleMinutes = dto.staleMinutes ?? BROWSER_BATCH_STALE_MINUTES;
    const limit = dto.limit ?? BROWSER_BATCH_STALE_LIMIT;
    const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000);
    const alerts = await this.operationAlerts.closeStaleOperations({
      organizationId,
      type: BROWSER_BATCH_OPERATION_TYPE,
      sourceType: BROWSER_BATCH_SOURCE_TYPE,
      staleBefore,
      status: 'cancelled',
      message: BROWSER_BATCH_STALE_MESSAGE,
      metadata: {
        staleReconciled: true,
        staleReconciledReason: 'browser_session_missing',
      },
      limit,
    });
    return alerts.map(mapAlertRowToItem);
  }

  private async dispatch(
    organizationId: string,
    operationKey: string,
    status: UpdateOperationAlertDto['status'],
    patch: OperationLifecyclePatch,
  ) {
    switch (status) {
      case 'pending':
        return this.operationAlerts.attention(
          organizationId,
          operationKey,
          patch,
        );
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
