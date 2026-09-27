import {
  Body,
  Controller,
  Header,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { MallOrderOperationMall } from '@kiditem/shared/orders-operations';
import {
  OrderCollectionService,
  type IcecreamSendFinishInput,
} from '../../../application/service/order-collection.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MallOrdersOperationService } from '../../../application/service/mall-orders-operation.service';
import { conversionFile, operationIdOf } from './operation-conversion';

const CONVERSION_HEADERS = [
  'Content-Disposition',
  'X-Order-Collection-Source-Rows',
  'X-Order-Collection-Product-Rows',
  'X-Order-Collection-Output-Rows',
  'X-Order-Collection-Skipped-Rows',
  'X-Order-Collection-Artifact-Id',
].join(', ');

/**
 * 몰별 변환 라우트. 몰 주문 수집은 실행 kind `orders.mall_orders`라(KID-359 H3·KID-380) 본문 `operationId`로 성공한
 * 그 몰 실행의 보관 캡처를 다시 변환해 돌려줄 뿐 아무것도 쓰지 않는다. 옛 attempt 헤더 변환은 없다(KID-380 T4) —
 * `operationId`가 없으면 VALIDATION_FAILED(operation_id_required)다.
 */
@Controller('orders/collection')
export class OrderCollectionController {
  constructor(
    private readonly orderCollectionService: OrderCollectionService,
    private readonly mallOrders: MallOrdersOperationService,
  ) {}

  @Post('art09/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertArt09(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('art09', organizationId, rawOperationId, response);
  }

  @Post('icecream-mall/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertIcecreamMall(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('icecream-mall', organizationId, rawOperationId, response);
  }

  @Post('icecream-mall/convert-rows')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertIcecreamMallRows(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('icecream-mall', organizationId, rawOperationId, response);
  }

  /** 셀피아 송장 × 아이스크림몰 배송 원본 → 출고완료 일괄등록 xlsx. 수집이 아니라 일회성 응답이다. */
  @Post('icecream-mall/send-finish/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertIcecreamSendFinish(
    @Body() body: IcecreamSendFinishInput,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const result = this.orderCollectionService.convertIcecreamSendFinish(body);
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('X-Order-Collection-Source-Rows', String(result.sourceRows));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.productRows));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.outputRows));
    response.setHeader('X-Order-Collection-Skipped-Rows', String(result.skippedRows));
    return new StreamableFile(result.buffer);
  }

  @Post('kidsnote/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertKidsnote(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('kidsnote', organizationId, rawOperationId, response);
  }

  @Post('kkomangse/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertKkomangse(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('kkomangse', organizationId, rawOperationId, response);
  }

  @Post('onchannel/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertOnchannel(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('onch', organizationId, rawOperationId, response);
  }

  @Post('kidkids/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertKidkids(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('kidkids', organizationId, rawOperationId, response);
  }

  @Post('haebeop/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertHaebeop(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('haebub-mall', organizationId, rawOperationId, response);
  }

  @Post('domeggook/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertDomeggook(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('domeggook', organizationId, rawOperationId, response);
  }

  @Post('boribori/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertBoribori(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('boribori', organizationId, rawOperationId, response);
  }

  @Post('teacherville/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertTeacherville(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('teacher-mall', organizationId, rawOperationId, response);
  }

  @Post('lotteon/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertLotteon(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('lotte-on', organizationId, rawOperationId, response);
  }

  @Post('gsshop/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertGsshop(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('gs-shop', organizationId, rawOperationId, response);
  }

  @Post('alwayz/convert')
  @Header('Access-Control-Expose-Headers', CONVERSION_HEADERS)
  convertAlwayz(
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Body('operationId') rawOperationId?: unknown,
  ): Promise<StreamableFile> {
    return this.convertOperation('always', organizationId, rawOperationId, response);
  }

  /** 성공한 그 몰 실행의 보관 캡처를 다시 변환한다. 수집 기록(주문 수·캡처)은 finish가 이미 적었다. */
  private async convertOperation(
    mallKey: MallOrderOperationMall,
    organizationId: string,
    rawOperationId: unknown,
    response: Response,
  ): Promise<StreamableFile> {
    const operationId = operationIdOf(rawOperationId);
    if (!operationId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'operation_id_required', mallKey } });
    }
    return conversionFile(response, await this.mallOrders.convertOperation({ organizationId, operationId, mallKey }));
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
