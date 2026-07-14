import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import type { MulterFile } from '../../common/types';
import {
  OrderCollectionService,
  type OrderCollectionRowsInput,
  type IcecreamSendFinishInput,
  type DomeggookShipInput,
  type KidsnoteConvertInput,
  type KkomangseConvertInput,
  type OnchannelConvertInput,
  type KidkidsConvertInput,
  type KakaoConvertInput,
} from '../services/order-collection.service';
import {
  CoupangDirectshipService,
  type CoupangDirectInput,
} from '../coupang-directship/coupang-directship.service';

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
  ) {}

  @Post('coupang-directship/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  async convertCoupangDirectship(
    @Body() body: CoupangDirectInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.coupangDirectshipService.generate(body);
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.ms-excel');
    response.setHeader('X-Order-Collection-Source-Rows', String(result.poCount));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Skipped-Rows', '0');
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

  // 아이스크림몰 송장 업로드용 파일 생성 (비파괴 — 파일만 반환. 실제 몰 업로드는 프론트/확장이 별도로).
  @Post('icecream-mall/sendfinish-file')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Icecream-SendFinish-Source-Rows',
    'X-Icecream-SendFinish-Tracking-Rows',
    'X-Icecream-SendFinish-Matched-Rows',
    'X-Icecream-SendFinish-Unmapped-Couriers',
  ].join(', '))
  buildIcecreamSendFinishFile(
    @Body() body: IcecreamSendFinishInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.buildIcecreamSendFinishFile(body);
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('X-Icecream-SendFinish-Source-Rows', String(result.sourceRows));
    response.setHeader('X-Icecream-SendFinish-Tracking-Rows', String(result.trackingRows));
    response.setHeader('X-Icecream-SendFinish-Matched-Rows', String(result.matchedRows));
    response.setHeader(
      'X-Icecream-SendFinish-Unmapped-Couriers',
      encodeURIComponent(result.unmappedCouriers.join(',')),
    );
    return new StreamableFile(result.buffer);
  }

  // 도매꾹 송장 엑셀일괄입력용 파일 생성 (비파괴 — 파일만. 실제 shipXls 업로드는 확장이 확인 후).
  @Post('domeggook/ship-file')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Domeggook-Ship-Row-Count',
    'X-Domeggook-Ship-Order-Nos',
    'X-Domeggook-Ship-Unmapped-Couriers',
  ].join(', '))
  buildDomeggookShipFile(
    @Body() body: DomeggookShipInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.buildDomeggookShipFile(body);
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.ms-excel');
    response.setHeader('X-Domeggook-Ship-Row-Count', String(result.rowCount));
    response.setHeader('X-Domeggook-Ship-Order-Nos', encodeURIComponent(result.orderNos.join(',')));
    response.setHeader(
      'X-Domeggook-Ship-Unmapped-Couriers',
      encodeURIComponent(result.unmappedCouriers.join(',')),
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

  @Post('kakao/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
  ].join(', '))
  convertKakao(
    @Body() body: KakaoConvertInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertKakaoOrders(body);
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
