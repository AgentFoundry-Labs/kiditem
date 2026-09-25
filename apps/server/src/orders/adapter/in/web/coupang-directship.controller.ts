import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type {
  Request,
  Response,
} from 'express';

import { CoupangDirectshipService } from '../../../coupang-directship/coupang-directship.service';
import {
  type CoupangDirectOrderCollectionRequest,
  type CoupangDirectPoSnapshotResponse,
  SaveCoupangDirectPoSnapshotRequestSchema,
} from '@kiditem/shared/coupang-direct-order';
import { CoupangDirectPoSnapshotService } from '../../../application/service/coupang-direct-po-snapshot.service';
import { type OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_PORT,
  type CoupangDirectOrderCollectionPort,
} from '../../../application/port/in/coupang-direct-order-collection.port';

/**
 * 쿠팡 directship(로켓 최종주문) 캡처·스냅샷·변환 라우트. `OrderCollectionController`에서 순수 이동(KID-355 wave2
 * 골격 — H2가 이 파일을 실행 계약 kind `orders.coupang_directship`로 다시 쓰고, H3는 몰 라우트만 만진다).
 */
@Controller('orders/collection')
export class CoupangDirectshipController {
  constructor(
    private readonly coupangDirectshipService: CoupangDirectshipService,
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_PORT)
    private readonly coupangDirectOrderCollection: CoupangDirectOrderCollectionPort,
    private readonly coupangDirectPoSnapshot: CoupangDirectPoSnapshotService,
  ) {}

  @Post('coupang-directship/attempts')
  async beginCoupangDirectAttempt(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coupangDirectOrderCollection.beginAttempt({
      organizationId,
      userId: user.id,
      channelAccountId: channelAccountIdFromBody(body),
      idempotencyKey: requiredDirectIdempotencyKey(idempotencyKey),
    });
  }

  @Get('coupang-directship/attempts/:attemptId')
  async readCoupangDirectAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const attempt = await this.coupangDirectOrderCollection.readAttempt({
      organizationId,
      attemptId,
    });
    if (!attempt) throw new NotFoundException('COUPANG_DIRECT_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('coupang-directship/attempts/:attemptId/control')
  async readCoupangDirectAttemptControl(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    const attempt = await this.coupangDirectOrderCollection.readAttemptControl({
      organizationId,
      attemptId,
    });
    if (!attempt) throw new NotFoundException('COUPANG_DIRECT_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('coupang-directship/attempts/:attemptId/capture')
  async readCoupangDirectCapture(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.coupangDirectOrderCollection.readCaptured({
      organizationId,
      attemptId,
    });
  }

  @Post('coupang-directship/attempts/:attemptId/complete')
  async completeCoupangDirectAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: unknown,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coupangDirectOrderCollection.completeAttempt({
      organizationId,
      userId: user.id,
      attemptId,
      attemptToken: requiredDirectAttemptToken(attemptToken),
      capture: body as never,
    });
  }

  @Post('coupang-directship/attempts/:attemptId/fail')
  async failCoupangDirectAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: unknown,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const failure = failureBody(body);
    return this.coupangDirectOrderCollection.failAttempt({
      organizationId,
      attemptId,
      attemptToken: requiredDirectAttemptToken(attemptToken),
      code: failure.code,
      message: failure.message,
    });
  }

  /** 화면의 중단 버튼. 토큰 없이 조직 범위로만 끝내며 실패 알림을 남기지 않는다. */
  @Post('coupang-directship/attempts/:attemptId/cancel')
  @HttpCode(200)
  async cancelCoupangDirectAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.coupangDirectOrderCollection.cancelAttempt({ organizationId, attemptId });
  }

  /**
   * 공용 시작 컨트롤이 폴링하는 직배송 계정별 현재 상태. 시도 토큰은 담지 않는다 —
   * fence 토큰은 확장이 부르는 `attempts/:id/control`에만 나간다.
   */
  @Get('coupang-directship/source')
  async readCoupangDirectSourceStatus(
    @Query('channelAccountId') channelAccountId: string | undefined,
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionSourceStatus> {
    return this.coupangDirectOrderCollection.readSourceStatus({
      organizationId,
      channelAccountId: requiredDirectChannelAccountId(channelAccountId),
    });
  }

  // 입고예정일 달력이 즉시 뜨도록 마지막 수집분을 계정 범위로 보관/조회한다.
  @Get('coupang-directship/snapshot')
  async readCoupangDirectSnapshot(
    @Query('channelAccountId') channelAccountId: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<CoupangDirectPoSnapshotResponse> {
    return this.coupangDirectPoSnapshot.read(organizationId, channelAccountId);
  }

  @Post('coupang-directship/snapshot')
  async saveCoupangDirectSnapshot(
    @Body() body: unknown,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
  ): Promise<CoupangDirectPoSnapshotResponse> {
    const request = SaveCoupangDirectPoSnapshotRequestSchema.parse(body);
    const control = await this.coupangDirectOrderCollection.readAttemptControl({
      organizationId,
      attemptId: requiredDirectAttemptId(attemptId),
    });
    const token = requiredDirectAttemptToken(attemptToken);
    if (!control || control.attemptToken !== token || control.state !== 'COMPLETE') {
      throw new BadRequestException('ATTEMPT_FENCE_LOST');
    }
    await this.coupangDirectOrderCollection.readCaptured({
      organizationId,
      attemptId: control.attemptId,
      channelAccountId: request.channelAccountId,
    });
    return this.coupangDirectPoSnapshot.replace(
      organizationId,
      request.channelAccountId,
      request.entries,
    );
  }

  @Post('coupang-directship/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
    'X-Order-Collection-Import-Run-Id',
    'X-Rocket-Workbook-Export-Id',
    'X-Sellpia-Transmission-Intent-Key',
    'X-Rocket-Workbook-Matched-Rows',
    'X-Rocket-Workbook-Unmatched-Rows',
  ].join(', '))
  async convertCoupangDirectship(
    @Body() body: CoupangDirectOrderCollectionRequest,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | void> {
    const fence = {
      attemptId: requiredDirectAttemptId(attemptId),
      attemptToken: requiredDirectAttemptToken(attemptToken),
    };
    // The extension has already committed the complete raw capture. This
    // route only consumes a verified selection for one transport; conversion
    // failures must not turn the completed source owner into FAILED.
    await this.coupangDirectOrderCollection.consumeAttempt({
      organizationId,
      userId: user.id,
      ...fence,
      capture: body as never,
      transport: body.transport,
    });
    const projection = await this.coupangDirectOrderCollection.readProjection({
      organizationId,
      attemptId: fence.attemptId,
      transport: body.transport,
    });
    const collected = projection.receipt;
    response.setHeader('X-Order-Collection-Import-Run-Id', projection.importRunId);
    if (collected.exportId) {
      response.setHeader('X-Rocket-Workbook-Export-Id', collected.exportId);
    }
    if (collected.transmissionIntentKey) {
      response.setHeader(
        'X-Sellpia-Transmission-Intent-Key',
        collected.transmissionIntentKey,
      );
    }
    response.setHeader(
      'X-Order-Collection-Skipped-Rows',
      '0',
    );
    response.setHeader(
      'X-Rocket-Workbook-Matched-Rows',
      String(collected.matchedLines.length),
    );
    response.setHeader(
      'X-Rocket-Workbook-Unmatched-Rows',
      String(collected.unmatchedLines.length),
    );
    if (collected.collectedLines.length === 0) {
      response.setHeader('X-Order-Collection-Source-Rows', '0');
      response.setHeader('X-Order-Collection-Product-Rows', '0');
      response.setHeader('X-Order-Collection-Output-Rows', '0');
      response.status(204);
      return;
    }

    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort());
    const result = await this.coupangDirectshipService.generate(projection.request, {
      signal: abortController.signal,
    });
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.ms-excel');
    response.setHeader('X-Order-Collection-Source-Rows', String(result.poCount));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.rowCount));
    return new StreamableFile(result.buffer);
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function channelAccountIdFromBody(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('CHANNEL_ACCOUNT_ID_REQUIRED');
  }
  const channelAccountId = (value as { channelAccountId?: unknown }).channelAccountId;
  if (typeof channelAccountId !== 'string' || !channelAccountId.trim()) {
    throw new BadRequestException('CHANNEL_ACCOUNT_ID_REQUIRED');
  }
  return channelAccountId;
}

function requiredDirectAttemptId(value: string | undefined): string {
  const attemptId = value?.trim();
  if (!attemptId) throw new BadRequestException('ORDER_COLLECTION_ATTEMPT_HEADERS_REQUIRED');
  if (!isUuid(attemptId)) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_ID');
  return attemptId;
}

function requiredDirectAttemptToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token) throw new BadRequestException('ORDER_COLLECTION_ATTEMPT_HEADERS_REQUIRED');
  if (!isUuid(token)) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return token;
}

/** 공용 컨트롤의 상태 읽기 범위. 계정 없이는 어느 수집을 묻는지 정해지지 않는다. */

function requiredDirectChannelAccountId(value: string | undefined): string {
  const channelAccountId = value?.trim();
  if (!channelAccountId || !isUuid(channelAccountId)) {
    throw new BadRequestException('INVALID_COUPANG_DIRECT_SCOPE');
  }
  return channelAccountId;
}

function requiredDirectIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 128) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
  return key;
}

function failureBody(value: unknown): { code: string; message: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('FAILURE_CODE_REQUIRED');
  }
  const body = value as { code?: unknown; message?: unknown };
  if (typeof body.code !== 'string' || !body.code.trim()) {
    throw new BadRequestException('FAILURE_CODE_REQUIRED');
  }
  return {
    code: body.code.trim().slice(0, 80),
    message: typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 500)
      : 'Coupang direct order capture failed.',
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
