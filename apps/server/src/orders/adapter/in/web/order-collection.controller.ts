import {
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Header,
  Headers,
  Inject,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  Request,
  Response,
} from 'express';

import type { MulterFile } from '../../../../common/types';
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
} from '../../../application/service/order-collection.service';
import { orderCollectionOrderCount } from '@kiditem/shared/order-collection-source';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
  type OrderCollectionConfirmedCoverage,
  type OrderCollectionSourcePort,
} from '../../../application/port/in/order-collection-source.port';
import { MallOrdersOperationService } from '../../../application/service/mall-orders-operation.service';
import { conversionFile, operationIdOf } from './operation-conversion';

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
const OrderCollectionConfirmedCoverageHeader = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrderCollectionConfirmedCoverage | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return confirmedCoverageFromHeaders(
      request.headers['x-order-collection-coverage-start-date'],
      request.headers['x-order-collection-coverage-end-date'],
    );
  },
);

/**
 * 변환 결과가 말하는 주문 건수. 화면과 같은 셈법을 쓰려고 shared 규칙을 그대로 부른다 —
 * 여기서 다시 세면 주문수집 화면과 대시보드가 다른 수를 말하게 된다.
 */
function orderCount(result: Readonly<{ outputRows: number; productRows: number }>): number | undefined {
  return orderCollectionOrderCount(result) ?? undefined;
}

@Controller('orders/collection')
export class OrderCollectionController {
  constructor(
    private readonly orderCollectionService: OrderCollectionService,
    @Inject(ORDER_COLLECTION_SOURCE_PORT)
    private readonly orderCollectionSource: OrderCollectionSourcePort,
    private readonly mallOrders: MallOrdersOperationService,
  ) {}

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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('art09', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('icecream-mall', organizationId, operationId, response);
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('icecream-mall', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('kidsnote', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('kkomangse', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('onch', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('kidkids', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @OrderCollectionConfirmedCoverageHeader() confirmedCoverage: OrderCollectionConfirmedCoverage | null,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('haebub-mall', organizationId, operationId, response);
    const source = orderCollectionJsonSubmission(body, null);
    const result = await this.convertWithAttempt(
      'haebub-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      () => this.orderCollectionService.convertHaebeopOrders(body),
      confirmedCoverage,
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'haebub-mall',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
      confirmedCoverage,
      orderCount(result),
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
    @OrderCollectionConfirmedCoverageHeader() confirmedCoverage: OrderCollectionConfirmedCoverage | null,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('domeggook', organizationId, operationId, response);
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
      confirmedCoverage,
    );
    this.setConversionHeaders(result, response);
    await this.persistConversion(
      'domeggook',
      organizationId,
      attemptId,
      attemptToken,
      source,
      response,
      confirmedCoverage,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('boribori', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('teacher-mall', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('lotte-on', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('gs-shop', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (operationId) return this.convertOperation('always', organizationId, operationId, response);
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
      null,
      orderCount(result),
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
      null,
      orderCount(result),
    );
    return new StreamableFile(result.buffer);
  }

  /**
   * 실행 kind(`orders.mall_orders`)로 옮긴 몰은 본문의 `operationId`로 온다(KID-359 H3): 성공한 그 몰 실행의 보관
   * 캡처를 다시 변환해 돌려준다. 수집 기록(주문 수·캡처)은 finish가 이미 적었으므로 여기서 쓰는 것은 없다 —
   * `SourceImportRun`도 만지지 않는다. 옛 attempt 헤더 경로는 2차 몰을 위해 그대로 남는다(나머지 몰이 옮겨질 때까지).
   */
  private async convertOperation(
    mallKey: string,
    organizationId: string,
    operationId: string,
    response: Response,
  ): Promise<StreamableFile> {
    return conversionFile(response, await this.mallOrders.convertOperation({ organizationId, operationId, mallKey }));
  }

  private async convertWithAttempt<T>(
    mallKey: string,
    organizationId: string,
    attemptId: string | undefined,
    attemptToken: string | undefined,
    source: Parameters<OrderCollectionSourcePort['completeAttempt']>[0]['source'],
    convert: () => T | Promise<T>,
    confirmedCoverage: OrderCollectionConfirmedCoverage | null = null,
  ): Promise<Awaited<T>> {
    const fence = this.requireAttemptFence(attemptId, attemptToken);
    await this.orderCollectionSource.validateCompletion({
      organizationId,
      attemptId: fence.attemptId,
      attemptToken: fence.attemptToken,
      mallKey,
      source,
      confirmedCoverage,
    });
    try {
      return await convert();
    } catch (error) {
      await this.orderCollectionSource.failAttempt({
        organizationId,
        attemptId: fence.attemptId,
        attemptToken: fence.attemptToken,
        code: conversionFailureCode(error),
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
    confirmedCoverage: OrderCollectionConfirmedCoverage | null = null,
    /**
     * 이 수집이 실어 온 **주문 건수**(줄 수가 아니다). 완료 시점에는 원본 바이트만 있어 몇
     * 건인지 모르고, 셀피아 양식으로 변환할 때 비로소 안다. 적지 않으면 성공한 수집도 0 건으로
     * 남아 대시보드의 '오늘 주문' 이 모자라게 센다(사장님 2026-09-21).
     *
     * 출력 줄을 그대로 적으면 상품 줄만큼 부풀어 주문수집 화면과 어긋난다 — 63 대 82
     * (사장님 2026-09-22). `orderCollectionOrderCount` 가 유일한 셈법이다.
     */
    rowCount?: number,
  ): Promise<void> {
    const fence = this.requireAttemptFence(attemptId, attemptToken);
    const artifact = await this.orderCollectionSource.completeAttempt({
      organizationId,
      attemptId: fence.attemptId,
      attemptToken: fence.attemptToken,
      mallKey,
      source,
      confirmedCoverage,
    });
    if (rowCount !== undefined) {
      // 0 건도 적는다 — "걷었는데 없었다" 는 측정이지 모름이 아니다.
      await this.orderCollectionSource.recordCollectedRows({
        organizationId,
        attemptId: fence.attemptId,
        rowCount,
      });
    }
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

/**
 * 변환이 스스로 붙인 코드를 그대로 쓴다. 없을 때만 `CONVERSION_FAILED` 다.
 *
 * 전에는 무엇이 잘못됐든 `CONVERSION_FAILED` 로 덮었다. 그래서 "그날 신규 주문이 없다"
 * (`NO_NEW_ORDERS`) 는 멀쩡한 날도 실패한 몰로 기록됐고, 화면은 꼬망세를 고장난 몰처럼
 * 보여 줬다(사장님 2026-09-21). 변환기는 이미 옳은 코드를 던지고 있었다.
 */

function conversionFailureCode(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) return code.trim().slice(0, 80);
    }
  }
  return 'CONVERSION_FAILED';
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

function confirmedCoverageFromHeaders(
  startDate: string | string[] | undefined,
  endDate: string | string[] | undefined,
): OrderCollectionConfirmedCoverage | null {
  if (startDate === undefined && endDate === undefined) return null;
  if (
    typeof startDate !== 'string' ||
    typeof endDate !== 'string' ||
    !isDateOnly(startDate) ||
    !isDateOnly(endDate)
  ) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_CONFIRMED_COVERAGE');
  }
  return { startDate, endDate };
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
