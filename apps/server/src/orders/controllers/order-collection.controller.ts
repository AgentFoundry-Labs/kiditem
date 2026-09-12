import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import type { MulterFile } from '../../common/types';
import {
  OrderCollectionService,
  type OrderCollectionRowsInput,
  type Art09ConvertInput,
  type KidsnoteConvertInput,
  type KkomangseConvertInput,
  type OnchannelConvertInput,
  type KidkidsConvertInput,
  type HaebeopConvertInput,
  type IcecreamSendFinishInput,
} from '../services/order-collection.service';
import {
  CoupangDirectshipService,
} from '../coupang-directship/coupang-directship.service';
import {
  type CoupangDirectOrderCollectionRequest,
  type CoupangDirectPoSnapshotResponse,
  SaveCoupangDirectPoSnapshotRequestSchema,
} from '@kiditem/shared/coupang-direct-order';
import { CoupangDirectPoSnapshotService } from '../services/coupang-direct-po-snapshot.service';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_PORT,
  type CoupangDirectOrderCollectionPort,
} from '../application/port/in/coupang-direct-order-collection.port';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
  type OrderCollectionSourcePort,
} from '../application/port/in/order-collection-source.port';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const ALLOWED_EXTENSIONS = /\.(txt|tsv|csv|xls|xlsx)$/i;

@Controller('orders/collection')
export class OrderCollectionController {
  constructor(
    private readonly orderCollectionService: OrderCollectionService,
    private readonly coupangDirectshipService: CoupangDirectshipService,
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_PORT)
    private readonly coupangDirectOrderCollection: CoupangDirectOrderCollectionPort,
    private readonly coupangDirectPoSnapshot: CoupangDirectPoSnapshotService,
    @Inject(ORDER_COLLECTION_SOURCE_PORT)
    private readonly orderCollectionSource: OrderCollectionSourcePort,
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

  @Post('art09/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
    'X-Order-Collection-Artifact-Id',
  ].join(', '))
  async convertArt09(
    @Body() body: Art09ConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body);
    const result = await this.convertWithAttempt(
      'art09',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertArt09Orders(body),
    );
    this.setConversionHeaders(result, response, 'text/csv;charset=utf-8');
    await this.persistConversion(
      'art09',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('icecream-mall/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('주문 엑셀 또는 텍스트 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  convertIcecreamMall(
    @UploadedFile() file: MulterFile,
    @Body('password') password: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }

    return this.convertIcecreamMallFile(
      file,
      password,
      organizationId,
      attemptId,
      attemptToken,
      response,
    );
  }

  @Post('icecream-mall/convert-rows')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertIcecreamMallRows(
    @Body() body: OrderCollectionRowsInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, body.fileName ? String(body.fileName) : null);
    const result = await this.convertWithAttempt(
      'icecream-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertIcecreamMallOrderRows(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'icecream-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('icecream-mall/send-finish/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  convertIcecreamSendFinish(
    @Body() body: IcecreamSendFinishInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertIcecreamSendFinish(body);
    this.setConversionHeaders(
      result,
      response,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return new StreamableFile(result.buffer);
  }

  @Post('kidsnote/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertKidsnote(
    @Body() body: KidsnoteConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, body.fileName ?? null);
    const result = await this.convertWithAttempt(
      'kidsnote',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertKidsnoteOrders(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'kidsnote',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('kkomangse/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertKkomangse(
    @Body() body: KkomangseConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, body.fileName ?? null);
    const result = await this.convertWithAttempt(
      'kkomangse',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertKkomangseOrders(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'kkomangse',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('onchannel/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertOnchannel(
    @Body() body: OnchannelConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, body.fileName ?? null);
    const result = await this.convertWithAttempt(
      'onch',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertOnchannelOrders(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'onch',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('kidkids/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertKidkids(
    @Body() body: KidkidsConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, body.fileName ?? null);
    const result = await this.convertWithAttempt(
      'kidkids',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertKidkidsOrders(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'kidkids',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('haebeop/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertHaebeop(
    @Body() body: HaebeopConvertInput,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = orderCollectionJsonSubmission(body, null);
    const result = await this.convertWithAttempt(
      'haebub-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertHaebeopOrders(body),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'haebub-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('domeggook/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('도매꾹 주문 CSV 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertDomeggook(
    @UploadedFile() file: MulterFile,
    @Body('date') date: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('CSV 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'domeggook',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertDomeggookOrderFile(file, { date }),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'domeggook',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('boribori/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('보리보리 주문 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertBoribori(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'boribori',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertBoriboriOrderFile(file),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'boribori',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('teacherville/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('티쳐몰 주문 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertTeacherville(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'teacher-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertTeachervilleOrderFile(file),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'teacher-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('lotteon/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('롯데ON 주문 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertLotteon(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'lotte-on',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertLotteonOrderFile(file),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'lotte-on',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('gsshop/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('GS샵 주문 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertGsshop(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'gs-shop',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertGsshopOrderFile(file),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'gs-shop',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('alwayz/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
        if (mimeOk || extOk) return cb(null, true);
        cb(new BadRequestException('올웨이즈 주문 엑셀 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  async convertAlwayz(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Headers('x-order-collection-attempt-id') attemptId: string | undefined,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'always',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertAlwayzOrderFile(file),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'always',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  private async convertIcecreamMallFile(
    file: MulterFile,
    password: string | undefined,
    organizationId: string,
    attemptId: string | undefined,
    attemptToken: string | undefined,
    response: Response,
  ): Promise<StreamableFile> {
    const source = fileSubmission(file);
    const result = await this.convertWithAttempt(
      'icecream-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertIcecreamMallOrderFile(file, { password }),
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'icecream-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
    );
    return new StreamableFile(result.buffer);
  }

  private async convertWithAttempt<T>(
    mallKey: string,
    organizationId: string,
    attemptId: string | undefined,
    attemptToken: string | undefined,
    source: Parameters<OrderCollectionSourcePort['completeAttempt']>[0]['source'],
    convert: () => T | Promise<T>,
  ): Promise<Awaited<T>> {
    const fence = this.requireAttemptFence(attemptId, attemptToken);
    try {
      return await convert();
    } catch (error) {
      await this.orderCollectionSource.failAttempt({
        organizationId,
        attemptId: fence.attemptId,
        attemptToken: fence.attemptToken,
        code: 'CONVERSION_FAILED',
        message: conversionFailureMessage(error),
        source,
      });
      throw error;
    }
  }

  private requireAttemptFence(
    attemptId: string | undefined,
    attemptToken: string | undefined,
  ): { attemptId: string; attemptToken: string } {
    if (!attemptId || !attemptToken) {
      throw new BadRequestException('ORDER_COLLECTION_ATTEMPT_HEADERS_REQUIRED');
    }
    return { attemptId, attemptToken };
  }

  private async persistConversion(
    mallKey: string,
    organizationId: string,
    attemptId: string | undefined,
    attemptToken: string | undefined,
    source: Parameters<OrderCollectionSourcePort['completeAttempt']>[0]['source'],
    response: Response,
  ): Promise<void> {
    const fence = this.requireAttemptFence(attemptId, attemptToken);
    const artifact = await this.orderCollectionSource.completeAttempt({
      organizationId,
      attemptId: fence.attemptId,
      attemptToken: fence.attemptToken,
      mallKey,
      source,
    });
    response.setHeader('X-Order-Collection-Artifact-Id', artifact.artifactId);
  }

  private setConversionHeaders(
    result: Awaited<ReturnType<OrderCollectionService['convertIcecreamMallOrderFile']>>,
    response: Response,
    contentType = 'application/vnd.ms-excel',
  ): void {
    response.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(result.fileName),
    );
    response.setHeader('Content-Type', contentType);
    response.setHeader('X-Order-Collection-Source-Rows', String(result.sourceRows));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.productRows));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.outputRows));
    response.setHeader('X-Order-Collection-Skipped-Rows', String(result.skippedRows));
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function fileSubmission(file: MulterFile) {
  return {
    bytes: Buffer.from(file.buffer),
    fileName: file.originalname,
    contentType: file.mimetype || 'application/octet-stream',
    isFile: true,
  } as const;
}

function conversionFailureMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const message = (response as { message?: unknown }).message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Order collection conversion failed.';
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
