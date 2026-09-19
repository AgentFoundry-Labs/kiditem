import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SalesProductService } from '../../../application/service/sales-product.service';
import { SabangnetProductImportService } from '../../../application/service/sabangnet-product-import.service';

interface UploadedWorkbookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_WORKBOOK_SIZE = 30 * 1024 * 1024;
const WORKBOOK_EXTENSIONS = /\.(xlsx|xls)$/i;

/**
 * 판매상품 · 단품(ADR-0013). 조직은 세션에서만 온다. 사방넷 엑셀 가져오기는 `dryRun=true` 로 먼저
 * 무엇이 바뀔지 보고, 같은 파일로 다시 불러 확정한다.
 */
@Controller('products/sales-products')
export class SalesProductController {
  constructor(
    private readonly salesProducts: SalesProductService,
    private readonly sabangnetImport: SabangnetProductImportService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.salesProducts.list(organizationId, query);
  }

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.salesProducts.create(organizationId, body);
  }

  @Post('imports/sabangnet')
  @UseInterceptors(
    FilesInterceptor('files', 3, {
      limits: { fileSize: MAX_WORKBOOK_SIZE },
      fileFilter: (_req, file, cb) => {
        if (WORKBOOK_EXTENSIONS.test(file.originalname)) return cb(null, true);
        cb(new BadRequestException('사방넷에서 내려받은 엑셀(.xlsx) 파일만 받습니다.'), false);
      },
    }),
  )
  importSabangnet(
    @CurrentOrganization() organizationId: string,
    @UploadedFiles() files: UploadedWorkbookFile[] | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.sabangnetImport.import(organizationId, files ?? [], dryRun !== 'false');
  }

  @Get(':salesProductId')
  get(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
  ) {
    return this.salesProducts.get(organizationId, salesProductId);
  }

  @Patch(':salesProductId')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: unknown,
  ) {
    return this.salesProducts.update(organizationId, salesProductId, body);
  }

  @Put(':salesProductId/options')
  replaceOptions(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: unknown,
  ) {
    return this.salesProducts.replaceOptions(organizationId, salesProductId, body);
  }

  @Put(':salesProductId/channel-overrides/:channelAccountId')
  upsertChannelOverride(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @Body() body: unknown,
  ) {
    return this.salesProducts.upsertChannelOverride(organizationId, salesProductId, channelAccountId, body);
  }

  @Delete(':salesProductId/channel-overrides/:channelAccountId')
  deleteChannelOverride(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
  ) {
    return this.salesProducts.deleteChannelOverride(organizationId, salesProductId, channelAccountId);
  }
}
