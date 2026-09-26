import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type {
  OrderCollectionSourceStatus,
  OrderCollectionTodayOrders,
} from '@kiditem/shared/order-collection-source';
import { isMallOrderAttemptMall } from '@kiditem/shared/orders-operations';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
  type OrderCollectionMode,
  type OrderCollectionSourcePort,
} from '../../../application/port/in/order-collection-source.port';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  ORDER_COLLECTION_TODAY_ORDERS_PORT,
  type OrderCollectionTodayOrdersPort,
} from '../../../application/port/in/order-collection-today-orders.port';
import { MallOrdersOperationService } from '../../../application/service/mall-orders-operation.service';
import type { IcecreamContinuation } from '../../../domain/mall-orders-operation';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { conversionFile, operationIdOf } from './operation-conversion';
import type { Response } from 'express';

@Controller('orders/collection')
export class OrderCollectionSourceController {
  constructor(
    @Inject(ORDER_COLLECTION_SOURCE_PORT)
    private readonly source: OrderCollectionSourcePort,
    @Inject(ORDER_COLLECTION_TODAY_ORDERS_PORT)
    private readonly todayOrders: OrderCollectionTodayOrdersPort,
    private readonly mallOrders: MallOrdersOperationService,
  ) {}

  /** KID-379: 옛 attempt 시작은 카카오(`MALL_ORDER_ATTEMPT_MALLS`)의 브라우저 수집만 받는다. */
  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const body = parseBeginBody(rawBody);
    return this.source.beginAttempt({
      organizationId,
      userId: user.id,
      idempotencyKey: requireHeader(idempotencyKey, 'idempotency_key_invalid'),
      ...body,
    });
  }

  /**
   * 몰 카드 20장을 띄우는 화면이 폴링 한 번으로 읽는 조직 범위 목록. 카드마다 읽으면
   * 폴링만으로 전역 throttler를 넘겨 화면 전체가 429를 받는다(KID-170 D2). 몰 하나짜리
   * 읽기와 마찬가지로 시도 토큰은 담지 않는다.
   */
  @Get('sources') // KID-379: 카카오 카드가 읽는다(옛 attempt 행).
  async readSourceStatuses(
    @CurrentOrganization() organizationId: string,
  ): Promise<{ malls: OrderCollectionSourceStatus[] }> {
    return { malls: await this.source.readSourceStatuses({ organizationId }) };
  }

  /**
   * 오늘 수집이 실어 온 주문 수(서버 기록, Orders 오늘 주문 capability). 브라우저에 남은 변환 파일이 아니라서
   * 어느 PC 에서 열어도 같고, 대시보드의 '오늘 주문' 과 같은 capability를 읽는다(사장님 2026-09-22).
   *
   * 원천 목록(`sources`)과 달리 2초마다 부르지 않는다 — 수집이 끝났을 때만 다시 읽으면 된다.
   */
  @Get('today-orders')
  readTodayOrderCounts(
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionTodayOrders> {
    return this.todayOrders.readTodayOrders({ organizationId });
  }

  /** KID-379: 화면이 다시 열 때 이어 볼 카카오 시도. */
  @Get('attempts/:attemptId')
  async readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const attempt = await this.source.readAttempt({ organizationId, attemptId });
    if (!attempt) throw attemptNotFound(attemptId);
    return attempt;
  }

  /** KID-379: 확장(`order-collection-source-owner.js`)이 카카오 시도의 fence 토큰과 상태를 읽는다. */
  @Get('attempts/:attemptId/control')
  async readAttemptControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const control = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!control) throw attemptNotFound(attemptId);
    return control;
  }

  /**
   * 아이스크림몰 continuation(배송 색인·다음 자동 선택에 쓰는 원본 행·고른 행 키). 아이스크림몰은 실행 kind
   * `orders.mall_orders`로 옮겼으므로 성공한 그 실행의 보관 캡처에서만 읽는다(KID-359 H3) — 경로의 id와 query
   * `operationId`가 같은 실행이다. 다른 몰은 VALIDATION_FAILED(continuation_unsupported), 없는·끝나지 않은 실행은
   * OPERATION_NOT_FOUND.
   */
  @Get('attempts/:attemptId/continuation')
  async readContinuation(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Query('operationId') rawOperationId: unknown,
  ): Promise<IcecreamContinuation> {
    const operationId = operationIdOf(rawOperationId, attemptId);
    if (!operationId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'operation_id_required' } });
    }
    return this.mallOrders.readContinuation({ organizationId, operationId });
  }

  /** KID-379: 확장이 카카오 시도를 원본(변환 규격 없음)과 함께 실패로 닫는다. */
  @Post('attempts/:attemptId/fail')
  async failAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Body() rawBody: unknown,
  ) {
    const body = parseFailureBody(rawBody);
    return this.source.failAttempt({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
      ...body,
    });
  }

  /** KID-379: 화면의 중단 버튼(카카오). 토큰 없이 조직 범위로만 끝내며 실패 알림을 남기지 않는다. */
  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  async cancelAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.source.cancelAttempt({ organizationId, attemptId });
  }

  /**
   * 성공한 실행(`orders.mall_orders`)의 보관 캡처를 다시 변환한다 — 경로의 id와 본문 `operationId`가 같은 실행이다
   * (KID-359 H3). 옛 attempt 재변환은 없다(KID-380 T4): 카카오 시도는 변환 규격이 없어 완료되지 않는다.
   */
  @Post('attempts/:attemptId/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Artifact-Id',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
    'Cache-Control',
  ].join(', '))
  async convertOperation(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId, attemptId);
    if (!operationId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'operation_id_required' } });
    }
    return conversionFile(response, await this.mallOrders.convertOperation({ organizationId, operationId }));
  }
}

function parseBeginBody(value: unknown): {
  mallKey: string;
  collectionDate: string | null;
  collectionMode: Extract<OrderCollectionMode, 'browser'>;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('order_collection_scope_invalid');
  const body = value as Record<string, unknown>;
  const mallKey = optionalText(body.mallKey);
  const date = body.collectionDate;
  const collectionDate = date === undefined || date === null ? null : optionalText(date);
  if (!mallKey || (date !== undefined && date !== null && !collectionDate)) throw invalid('order_collection_scope_invalid');
  if (collectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw invalid('order_collection_date_invalid');
  // KID-379: 옛 경로는 카카오만. 다른 몰은 실행 kind `orders.mall_orders`, 수동 업로드는 `…/malls/:mallKey/upload`다.
  if (!isMallOrderAttemptMall(mallKey)) throw invalid('mall_not_attempt_path', { mallKey });
  const mode = body.collectionMode;
  if (mode === 'manual-upload') throw invalid('manual_upload_moved_to_operation', { mallKey });
  if (mode !== 'browser') throw invalid('order_collection_mode_invalid');
  const selectionMode = body.selectionMode;
  if (selectionMode !== undefined && selectionMode !== 'manual' && selectionMode !== 'automatic') {
    throw invalid('order_collection_selection_invalid');
  }
  const rawSeenRowKeys = body.seenRowKeys;
  if (rawSeenRowKeys !== undefined && (
    !Array.isArray(rawSeenRowKeys) ||
    rawSeenRowKeys.length > 8_000 ||
    rawSeenRowKeys.some((key) => typeof key !== 'string' || key.length > 2_000)
  )) {
    throw invalid('order_collection_selection_invalid');
  }
  if (selectionMode === 'automatic' && !Array.isArray(rawSeenRowKeys)) throw invalid('order_collection_selection_invalid');
  return {
    mallKey,
    collectionDate,
    collectionMode: 'browser',
    ...(selectionMode ? { selectionMode } : {}),
    ...(Array.isArray(rawSeenRowKeys) ? { seenRowKeys: rawSeenRowKeys } : {}),
  };
}

function parseFailureBody(value: unknown): {
  code: string;
  message: string;
  source?: ReturnType<typeof orderCollectionJsonSubmission>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('order_collection_failure_invalid');
  const body = value as Record<string, unknown>;
  const code = optionalText(body.code);
  const message = optionalText(body.message);
  if (!code || !message || code.length > 80 || message.length > 500) throw invalid('order_collection_failure_invalid');
  const raw = body.sourcePayload;
  return {
    code,
    message,
    ...(raw === undefined ? {} : { source: orderCollectionJsonSubmission(raw) }),
  };
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function requireHeader(value: string | undefined, reason: string): string {
  const text = optionalText(value);
  if (!text || text.length > 128) throw invalid(reason);
  return text;
}

function requireUuidHeader(value: string | undefined): string {
  const text = optionalText(value);
  if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw invalid('source_attempt_token_invalid');
  }
  return text;
}

function invalid(reason: string, details: Record<string, unknown> = {}): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}

function attemptNotFound(attemptId: string): KiditemNotFoundError {
  return new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'ORDER_COLLECTION_ATTEMPT_NOT_FOUND', attemptId } });
}
