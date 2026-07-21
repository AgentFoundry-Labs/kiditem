import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Inject,
  Post,
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
  type KidsnoteConvertInput,
  type KkomangseConvertInput,
  type OnchannelConvertInput,
  type KidkidsConvertInput,
} from '../services/order-collection.service';
import {
  CoupangDirectshipService,
} from '../coupang-directship/coupang-directship.service';
import type { CoupangDirectOrderCollectionRequest } from '@kiditem/shared/coupang-direct-order';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_PORT,
  type CoupangDirectCollectionLineRef,
  type CoupangDirectOrderCollectionPort,
} from '../application/port/in/coupang-direct-order-collection.port';

interface CoupangDirectConfirmedEmptyResponse {
  collected: 0;
  skipped: number;
  importRunId: string;
  message: string;
}

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
    private readonly coupangDirectOrders: CoupangDirectOrderCollectionPort,
  ) {}

  @Post('coupang-directship/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
    'X-Order-Collection-Import-Run-Id',
    'X-Order-Collection-Reconciled-Rows',
    'X-Order-Collection-Confirmed-Empty',
  ].join(', '))
  async convertCoupangDirectship(
    @Body() body: CoupangDirectOrderCollectionRequest,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | CoupangDirectConfirmedEmptyResponse> {
    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort());
    const collected = await this.coupangDirectOrders.collect({
      organizationId,
      userId: user.id,
      request: body,
    });
    response.setHeader('X-Order-Collection-Import-Run-Id', collected.importRunId);
    response.setHeader('X-Order-Collection-Reconciled-Rows', String(collected.reconciledRows));
    response.setHeader('X-Order-Collection-Skipped-Rows', String(collected.skippedLines.length));

    // 활성 발주확정이 있는 라인이 하나도 없으면 배치를 터뜨리지 않고 "수집할 확정 주문 없음"을
    // 2xx 성공으로 알린다. 파일은 만들지 않는다(확정된 주문만 셀피아 양식으로 내보낸다).
    if (collected.reconciledRows === 0) {
      response.setHeader('X-Order-Collection-Confirmed-Empty', '1');
      return {
        collected: 0,
        skipped: collected.skippedLines.length,
        importRunId: collected.importRunId,
        message: '수집할 확정 주문이 없습니다.',
      };
    }

    // 확정(정산)된 라인만 셀피아 양식에 담는다. 발주확정 없는 라인은 파일에서도 제외한다.
    const confirmedRequest = filterConfirmedPurchaseOrders(body, collected.confirmedLines);
    const result = await this.coupangDirectshipService.generate(confirmedRequest, {
      signal: abortController.signal,
    });
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.ms-excel');
    response.setHeader('X-Order-Collection-Source-Rows', String(result.poCount));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Confirmed-Empty', '0');
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
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }

    return this.convertIcecreamMallFile(file, password, response);
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
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = this.orderCollectionService.convertIcecreamMallOrderRows(body);
    this.setConversionHeaders(result, response);
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
  convertKidsnote(
    @Body() body: KidsnoteConvertInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertKidsnoteOrders(body);
    this.setConversionHeaders(result, response);
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
  convertKkomangse(
    @Body() body: KkomangseConvertInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertKkomangseOrders(body);
    this.setConversionHeaders(result, response);
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
  convertOnchannel(
    @Body() body: OnchannelConvertInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertOnchannelOrders(body);
    this.setConversionHeaders(result, response);
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
  convertKidkids(
    @Body() body: KidkidsConvertInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertKidkidsOrders(body);
    this.setConversionHeaders(result, response);
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
  convertDomeggook(
    @UploadedFile() file: MulterFile,
    @Body('date') date: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('CSV 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertDomeggookOrderFile(file, { date });
    this.setConversionHeaders(result, response);
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
  convertBoribori(
    @UploadedFile() file: MulterFile,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertBoriboriOrderFile(file);
    this.setConversionHeaders(result, response);
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
  convertTeacherville(
    @UploadedFile() file: MulterFile,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertTeachervilleOrderFile(file);
    this.setConversionHeaders(result, response);
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
  convertLotteon(
    @UploadedFile() file: MulterFile,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertLotteonOrderFile(file);
    this.setConversionHeaders(result, response);
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
  convertGsshop(
    @UploadedFile() file: MulterFile,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertGsshopOrderFile(file);
    this.setConversionHeaders(result, response);
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
  convertAlwayz(
    @UploadedFile() file: MulterFile,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!file) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    const result = this.orderCollectionService.convertAlwayzOrderFile(file);
    this.setConversionHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  private async convertIcecreamMallFile(
    file: MulterFile,
    password: string | undefined,
    response: Response,
  ): Promise<StreamableFile> {
    const result = await this.orderCollectionService.convertIcecreamMallOrderFile(file, { password });
    this.setConversionHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  private setConversionHeaders(
    result: Awaited<ReturnType<OrderCollectionService['convertIcecreamMallOrderFile']>>,
    response: Response,
  ): void {
    response.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(result.fileName),
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.ms-excel',
    );
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

/**
 * 확정(정산)된 (발주번호=seq, SKU=skuId) 라인만 남기도록 셀피아 양식 생성 입력을 좁힌다.
 * 발주확정이 없어 제외된 품목은 파일에서도 빠지고, 남은 품목이 없는 발주는 통째로 제외된다.
 */
function filterConfirmedPurchaseOrders(
  request: CoupangDirectOrderCollectionRequest,
  confirmedLines: CoupangDirectCollectionLineRef[],
): CoupangDirectOrderCollectionRequest {
  const confirmedKeys = new Set(
    confirmedLines.map(({ poNumber, productNo }) => JSON.stringify([poNumber, productNo])),
  );
  const pos = request.pos
    .map((purchaseOrder) => ({
      ...purchaseOrder,
      items: purchaseOrder.items.filter((item) =>
        confirmedKeys.has(JSON.stringify([String(purchaseOrder.seq).trim(), item.skuId]))),
    }))
    .filter((purchaseOrder) => purchaseOrder.items.length > 0);
  return { ...request, pos };
}
