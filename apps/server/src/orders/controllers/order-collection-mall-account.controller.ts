import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { MulterFile } from '../../common/types';
import {
  onePolarisSellpiaTemplateSummary,
  type OnePolarisSellpiaTemplateSummary,
} from '../domain/one-polaris-sellpia-order';
import { OrderCollectionService } from '../services/order-collection.service';
import {
  OrderCollectionMallAccountService,
  type OrderCollectionMallAccount,
  type OrderCollectionMallPassword,
  type UpdateOrderCollectionMallAccountInput,
} from '../services/order-collection-mall-account.service';

const TEMPLATE_UPLOAD_LIMIT = 10 * 1024 * 1024;

@Controller('orders/collection/malls')
export class OrderCollectionMallAccountController {
  constructor(
    private readonly accounts: OrderCollectionMallAccountService,
    private readonly conversions: OrderCollectionService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionMallAccount[]> {
    return this.accounts.list(organizationId);
  }

  /**
   * 원폴라리스 셀피아 양식(주소록 · 단가). 메일 주문 엑셀을 변환할 때 이 표로 칸을 채운다.
   * 저장된 것이 없으면 `template: null`. ':mallKey' 경로보다 먼저 선다.
   */
  @Get('one-polaris/sellpia-template')
  async onePolarisSellpiaTemplate(
    @CurrentOrganization() organizationId: string,
  ): Promise<{ template: OnePolarisSellpiaTemplateSummary | null }> {
    const template = await this.accounts.readOnePolarisSellpiaTemplate(organizationId);
    return { template: template ? onePolarisSellpiaTemplateSummary(template) : null };
  }

  @Put('one-polaris/sellpia-template')
  @Roles('owner', 'admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: TEMPLATE_UPLOAD_LIMIT },
      fileFilter: (_req, file, cb) => {
        if (/\.(xls|xlsx)$/i.test(file.originalname)) return cb(null, true);
        cb(new BadRequestException('원폴라리스 양식은 xls/xlsx 파일만 올릴 수 있습니다.'), false);
      },
    }),
  )
  async saveOnePolarisSellpiaTemplate(
    @UploadedFile() file: MulterFile | undefined,
    @CurrentOrganization() organizationId: string,
  ): Promise<{ template: OnePolarisSellpiaTemplateSummary }> {
    if (!file) throw new BadRequestException('원폴라리스 양식 파일(주소록 · 단가)이 필요합니다.');
    const template = await this.accounts.saveOnePolarisSellpiaTemplate(
      organizationId,
      this.conversions.parseOnePolarisSellpiaTemplateFile(file),
    );
    return { template: onePolarisSellpiaTemplateSummary(template) };
  }

  @Get(':mallKey/password')
  @Roles('owner', 'admin')
  password(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
  ): Promise<OrderCollectionMallPassword> {
    return this.accounts.getPassword(organizationId, mallKey);
  }

  /** ':mallKey' 보다 먼저 선언해야 'display-order' 가 몰 키로 잡히지 않는다. */
  @Patch('display-order')
  @Roles('owner', 'admin')
  reorder(
    @CurrentOrganization() organizationId: string,
    @Body() body: { mallKeys?: unknown },
  ): Promise<OrderCollectionMallAccount[]> {
    return this.accounts.reorder(organizationId, body?.mallKeys);
  }

  @Patch(':mallKey')
  @Roles('owner', 'admin')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: UpdateOrderCollectionMallAccountInput,
  ): Promise<OrderCollectionMallAccount> {
    return this.accounts.update(organizationId, mallKey, body);
  }
}
