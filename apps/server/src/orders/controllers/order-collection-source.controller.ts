import {
  BadRequestException,
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
  NotFoundException,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type {
  OrderCollectionSourceStatus,
  OrderCollectionTodayOrders,
} from '@kiditem/shared/order-collection-source';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
  type OrderCollectionMode,
  type OrderCollectionSourcePort,
} from '../application/port/in/order-collection-source.port';
import type { AuthUser } from '../../auth/auth.types';
import type { Response } from 'express';
import { z } from 'zod';
import {
  OrderCollectionService,
  type OrderCollectionConversion,
} from '../services/order-collection.service';

const confirmedEmptyOrdersSchema = z.object({
  kind: z.literal('confirmed-empty-orders'),
  mallKey: z.enum(['haebub-mall', 'domeggook']),
  orders: z.array(z.never()).length(0),
  confirmedCoverage: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
}).strict();

@Controller('orders/collection')
export class OrderCollectionSourceController {
  constructor(
    @Inject(ORDER_COLLECTION_SOURCE_PORT)
    private readonly source: OrderCollectionSourcePort,
    private readonly orderCollectionService: OrderCollectionService,
  ) {}

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
      idempotencyKey: requireHeader(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      ...body,
    });
  }

  /**
   * 공용 시작 컨트롤이 폴링하는 몰별 현재 상태. 시도 토큰은 담지 않는다 — fence
   * 토큰은 확장이 부르는 `attempts/:id/control`에만 나간다.
   */
  @Get('source')
  async readSourceStatus(
    @Query('mallKey') mallKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionSourceStatus> {
    const key = optionalText(mallKey);
    if (!key) throw new BadRequestException('INVALID_ORDER_COLLECTION_SCOPE');
    return this.source.readSourceStatus({ organizationId, mallKey: key });
  }

  /**
   * 몰 카드 20장을 띄우는 화면이 폴링 한 번으로 읽는 조직 범위 목록. 카드마다 읽으면
   * 폴링만으로 전역 throttler를 넘겨 화면 전체가 429를 받는다(KID-170 D2). 몰 하나짜리
   * 읽기와 마찬가지로 시도 토큰은 담지 않는다.
   */
  @Get('sources')
  async readSourceStatuses(
    @CurrentOrganization() organizationId: string,
  ): Promise<{ malls: OrderCollectionSourceStatus[] }> {
    return { malls: await this.source.readSourceStatuses({ organizationId }) };
  }

  /**
   * 오늘 수집이 실어 온 주문 수(서버 기록). 브라우저에 남은 변환 파일이 아니라서 어느 PC 에서
   * 열어도 같고, 대시보드의 '오늘 주문' 과 같은 사실을 읽는다(사장님 2026-09-22).
   *
   * 원천 목록(`sources`)과 달리 2초마다 부르지 않는다 — 수집이 끝났을 때만 다시 읽으면 된다.
   */
  @Get('today-orders')
  readTodayOrderCounts(
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionTodayOrders> {
    return this.source.readTodayOrderCounts({ organizationId });
  }

  @Get('attempts/:attemptId')
  async readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const attempt = await this.source.readAttempt({ organizationId, attemptId });
    if (!attempt) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('attempts/:attemptId/control')
  async readAttemptControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const control = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!control) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    return control;
  }

  /**
   * Returns only the provider-neutral continuation fields needed by the web
   * order collector after a server-owned conversion. The extension capture
   * remains in the owner artifact; this route never echoes the extension
   * response or an unvalidated arbitrary payload.
   */
  @Get('attempts/:attemptId/continuation')
  async readContinuation(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
  ): Promise<IcecreamOrderCollectionContinuation> {
    const control = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!control) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    if (control.attemptToken !== requireUuidHeader(attemptToken)) {
      throw new BadRequestException('ATTEMPT_FENCE_LOST');
    }
    if (control.state !== 'COMPLETE' || !control.artifactId) {
      throw new BadRequestException('ORDER_COLLECTION_SOURCE_NOT_COMPLETE');
    }
    if (control.plan.mallKey !== 'icecream-mall') {
      throw new BadRequestException('ORDER_COLLECTION_CONTINUATION_UNSUPPORTED');
    }
    const source = await this.source.readSourceDownload({
      organizationId,
      artifactId: control.artifactId,
    });
    return parseIcecreamContinuation(source);
  }

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

  /** 화면의 중단 버튼. 토큰 없이 조직 범위로만 끝내며 실패 알림을 남기지 않는다. */
  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  async cancelAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.source.cancelAttempt({ organizationId, attemptId });
  }

  @Post('attempts/:attemptId/complete-empty')
  async completeEmptyAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = confirmedEmptyOrdersSchema.safeParse(rawBody);
    if (!parsed.success) throw new BadRequestException('INVALID_EMPTY_ORDER_COLLECTION');
    const evidence = parsed.data;
    const artifact = await this.source.completeAttempt({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
      mallKey: evidence.mallKey,
      source: orderCollectionJsonSubmission(evidence),
      confirmedCoverage: evidence.confirmedCoverage,
    });
    setEmptyConversionHeaders(response, artifact.artifactId);
    return artifact;
  }

  @Get('artifacts/:artifactId/source')
  async downloadSource(
    @Param('artifactId', new ParseUUIDPipe()) artifactId: string,
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.source.readSourceDownload({
      organizationId,
      artifactId,
    });
    setDownloadHeaders(response, download.fileName, download.contentType);
    return new StreamableFile(download.bytes);
  }

  /**
   * Rebuilds a transient Sellpia workbook from the already-retained source
   * artifact. This is a scoped replay of the same owner input, not a new
   * collection attempt and never writes converted bytes to the database.
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
  async convertRetainedSource(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const control = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!control) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    if (control.attemptToken !== requireUuidHeader(attemptToken)) {
      throw new BadRequestException('ATTEMPT_FENCE_LOST');
    }
    if (control.state !== 'COMPLETE' || !control.artifactId) {
      throw new BadRequestException('ORDER_COLLECTION_SOURCE_NOT_COMPLETE');
    }
    const source = await this.source.readSourceDownload({
      organizationId,
      artifactId: control.artifactId,
    });
    const result = await this.convertRetainedSourcePayload(
      control.plan.mallKey,
      control.plan.collectionDate,
      source,
    );
    // 이 수집이 몇 건을 실어 왔는지는 여기서야 안다. 장부에 적어 두지 않으면 성공한 수집도
    // 건수 0 으로 남아, 대시보드의 '오늘 주문' 이 그만큼 모자라게 센다(사장님 2026-09-21).
    // 0 건도 적는다 — "걷었는데 없었다" 는 측정이지 모름이 아니다.
    await this.source.recordCollectedRows({
      organizationId,
      attemptId,
      rowCount: result.outputRows,
    });
    if (result.sourceRows === 0 && result.outputRows === 0) {
      setEmptyConversionHeaders(response, control.artifactId);
      response.status(204);
      return new StreamableFile(Buffer.alloc(0));
    }
    setConversionHeaders(response, result, control.artifactId, control.plan.mallKey);
    return new StreamableFile(result.buffer);
  }

  private async convertRetainedSourcePayload(
    mallKey: string,
    collectionDate: string | null,
    source: { bytes: Buffer; fileName: string | null; contentType: string },
  ): Promise<OrderCollectionConversion> {
    const contentType = source.contentType.toLowerCase();
    const isJson = contentType.includes('json') || source.fileName?.toLowerCase().endsWith('.json');
    if (isJson) {
      let payload: unknown;
      try {
        payload = JSON.parse(source.bytes.toString('utf8'));
      } catch {
        throw new BadRequestException('ORDER_COLLECTION_SOURCE_INVALID');
      }
      const empty = confirmedEmptyOrdersSchema.safeParse(payload);
      if (empty.success && empty.data.mallKey === mallKey) {
        return {
          buffer: Buffer.alloc(0), fileName: '',
          sourceRows: 0, productRows: 0, outputRows: 0, skippedRows: 0,
        };
      }
      switch (mallKey) {
        case 'icecream-mall':
          return this.orderCollectionService.convertIcecreamMallOrderRows(payload as never);
        case 'kidsnote':
          return this.orderCollectionService.convertKidsnoteOrders(payload as never);
        case 'kkomangse':
          return this.orderCollectionService.convertKkomangseOrders(payload as never);
        case 'onch':
          return this.orderCollectionService.convertOnchannelOrders(payload as never);
        case 'kidkids':
          return this.orderCollectionService.convertKidkidsOrders(payload as never);
        case 'haebub-mall':
          return this.orderCollectionService.convertHaebeopOrders(payload as never);
        case 'art09':
          return this.orderCollectionService.convertArt09Orders(payload as never);
        case 'kakao':
          throw new BadRequestException('ORDER_COLLECTION_UNSUPPORTED_CONVERSION');
        default:
          throw new BadRequestException('ORDER_COLLECTION_SOURCE_UNSUPPORTED');
      }
    }

    const file = {
      fieldname: 'file',
      originalname: source.fileName || `${mallKey}-orders.xlsx`,
      encoding: '7bit',
      mimetype: source.contentType || 'application/octet-stream',
      buffer: source.bytes,
      size: source.bytes.length,
    };
    switch (mallKey) {
      case 'domeggook':
        return this.orderCollectionService.convertDomeggookOrderFile(file, {
          date: collectionDate ?? undefined,
        });
      case 'boribori':
        return this.orderCollectionService.convertBoriboriOrderFile(file);
      case 'teacher-mall':
        return this.orderCollectionService.convertTeachervilleOrderFile(file);
      case 'lotte-on':
        return this.orderCollectionService.convertLotteonOrderFile(file);
      case 'gs-shop':
        return this.orderCollectionService.convertGsshopOrderFile(file);
      case 'always':
        return this.orderCollectionService.convertAlwayzOrderFile(file);
      case 'icecream-mall':
        return this.orderCollectionService.convertIcecreamMallOrderFile(file);
      default:
        throw new BadRequestException('ORDER_COLLECTION_SOURCE_UNSUPPORTED');
    }
  }
}

function parseBeginBody(value: unknown): {
  mallKey: string;
  collectionDate: string | null;
  collectionMode: OrderCollectionMode;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_SCOPE');
  }
  const body = value as Record<string, unknown>;
  const mallKey = optionalText(body.mallKey);
  const date = body.collectionDate;
  const collectionDate = date === undefined || date === null ? null : optionalText(date);
  if (!mallKey || (date !== undefined && date !== null && !collectionDate)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_SCOPE');
  }
  if (collectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_DATE');
  }
  const mode = body.collectionMode;
  if (mode !== 'browser' && mode !== 'manual-upload') {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_MODE');
  }
  const selectionMode = body.selectionMode;
  if (selectionMode !== undefined && selectionMode !== 'manual' && selectionMode !== 'automatic') {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_SELECTION');
  }
  const rawSeenRowKeys = body.seenRowKeys;
  if (rawSeenRowKeys !== undefined && (
    !Array.isArray(rawSeenRowKeys) ||
    rawSeenRowKeys.length > 8_000 ||
    rawSeenRowKeys.some((key) => typeof key !== 'string' || key.length > 2_000)
  )) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_SELECTION');
  }
  if (selectionMode === 'automatic' && !Array.isArray(rawSeenRowKeys)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_SELECTION');
  }
  return {
    mallKey,
    collectionDate,
    collectionMode: mode,
    ...(selectionMode ? { selectionMode } : {}),
    ...(Array.isArray(rawSeenRowKeys) ? { seenRowKeys: rawSeenRowKeys } : {}),
  };
}

function parseFailureBody(value: unknown): {
  code: string;
  message: string;
  source?: ReturnType<typeof orderCollectionJsonSubmission>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_FAILURE');
  }
  const body = value as Record<string, unknown>;
  const code = optionalText(body.code);
  const message = optionalText(body.message);
  if (!code || !message || code.length > 80 || message.length > 500) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_FAILURE');
  }
  const raw = body.sourcePayload;
  return {
    code,
    message,
    ...(raw === undefined ? {} : { source: orderCollectionJsonSubmission(raw) }),
  };
}

type IcecreamOrderCollectionContinuation = {
  mallKey: 'icecream-mall';
  headers: string[];
  originalRows: string[][];
  selectedRows: string[][];
  selectedRowKeys: string[];
  selectionMode: 'manual' | 'automatic';
  sourceRows: number;
};

function parseIcecreamContinuation(source: {
  bytes: Buffer;
  contentType: string;
}): IcecreamOrderCollectionContinuation {
  if (!source.contentType.toLowerCase().includes('json')) {
    throw new BadRequestException('ORDER_COLLECTION_CONTINUATION_UNAVAILABLE');
  }
  let value: unknown;
  try {
    value = JSON.parse(source.bytes.toString('utf8'));
  } catch {
    throw new BadRequestException('ORDER_COLLECTION_CONTINUATION_UNAVAILABLE');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('ORDER_COLLECTION_CONTINUATION_UNAVAILABLE');
  }
  const payload = value as Record<string, unknown>;
  const headers = stringArray(payload.headers);
  const originalRows = stringRows(payload.originalRows);
  const selectedRows = stringRows(payload.selectedRows);
  const selectedRowKeys = stringArray(payload.selectedRowKeys);
  const selectionMode = payload.selectionMode;
  if (
    !headers || !originalRows || !selectedRows || !selectedRowKeys ||
    (selectionMode !== 'manual' && selectionMode !== 'automatic') ||
    selectedRowKeys.length !== selectedRows.length
  ) {
    throw new BadRequestException('ORDER_COLLECTION_CONTINUATION_UNAVAILABLE');
  }
  return {
    mallKey: 'icecream-mall',
    headers,
    originalRows,
    selectedRows,
    selectedRowKeys,
    selectionMode,
    sourceRows: selectedRows.length,
  };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return [...value];
}

function stringRows(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null;
  const rows: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== 'string')) return null;
    rows.push([...row]);
  }
  return rows;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function requireHeader(value: string | undefined, code: string): string {
  const text = optionalText(value);
  if (!text || text.length > 128) throw new BadRequestException(code);
  return text;
}

function requireUuidHeader(value: string | undefined): string {
  const text = optionalText(value);
  if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  }
  return text;
}

function setDownloadHeaders(
  response: Response,
  fileName: string | null,
  contentType: string,
): void {
  if (fileName) {
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'private, no-store');
}

function setConversionHeaders(
  response: Response,
  result: OrderCollectionConversion,
  artifactId: string,
  mallKey: string,
): void {
  response.setHeader(
    'Content-Disposition',
    contentDispositionAttachment(result.fileName),
  );
  response.setHeader(
    'Content-Type',
    mallKey === 'art09' ? 'text/csv;charset=utf-8' : 'application/vnd.ms-excel',
  );
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Order-Collection-Artifact-Id', artifactId);
  response.setHeader('X-Order-Collection-Source-Rows', String(result.sourceRows));
  response.setHeader('X-Order-Collection-Product-Rows', String(result.productRows));
  response.setHeader('X-Order-Collection-Output-Rows', String(result.outputRows));
  response.setHeader('X-Order-Collection-Skipped-Rows', String(result.skippedRows));
}

function setEmptyConversionHeaders(response: Response, artifactId: string): void {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Order-Collection-Artifact-Id', artifactId);
  for (const name of ['Source-Rows', 'Product-Rows', 'Output-Rows', 'Skipped-Rows']) {
    response.setHeader(`X-Order-Collection-${name}`, '0');
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
