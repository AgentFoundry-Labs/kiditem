import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SalesProductService } from '../../../application/service/sales-product.service';
import { SabangnetProductImportService } from '../../../application/service/sabangnet-product-import.service';
import { SalesProductLinkService } from '../../../application/service/sales-product-link.service';
import { SalesProductImageService } from '../../../application/service/sales-product-image.service';
import { SalesProductMallPriceService } from '../../../application/service/sales-product-mall-price.service';
import { SalesProductMallSheetService } from '../../../application/service/sales-product-mall-sheet.service';

interface UploadedWorkbookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_WORKBOOK_SIZE = 30 * 1024 * 1024;
const WORKBOOK_EXTENSIONS = /\.(xlsx|xls)$/i;

/**
 * 판매상품 · 단품(ADR-0014). 조직은 세션에서만 온다. 사방넷 엑셀 가져오기는 `dryRun=true` 로 먼저
 * 무엇이 바뀔지 보고, 같은 파일로 다시 불러 확정한다.
 */
@Controller('products/sales-products')
export class SalesProductController {
  constructor(
    private readonly salesProducts: SalesProductService,
    private readonly sabangnetImport: SabangnetProductImportService,
    private readonly links: SalesProductLinkService,
    private readonly images: SalesProductImageService,
    private readonly mallPrices: SalesProductMallPriceService,
    private readonly mallSheets: SalesProductMallSheetService,
  ) {}

  /** 몰 대량등록 엑셀 목록 — 몰마다 고정값 칸과 기본값. */
  @Get('mall-sheets')
  mallSheetList() {
    return this.mallSheets.list();
  }

  /** 몰 엑셀에 무엇이 들어가고 무엇이 막히는지(파일은 만들지 않는다). id 를 비우면 이 몰에 없는 판매상품. */
  @Post('mall-sheets/:sheetKey/check')
  checkMallSheet(
    @CurrentOrganization() organizationId: string,
    @Param('sheetKey') sheetKey: string,
    @Body() body: unknown,
  ) {
    return this.mallSheets.check(organizationId, sheetKey, body);
  }

  /** 여러 판매상품의 한 몰 분류를 정한다(몰별 값의 categoryPath). 몰은 건드리지 않는다. */
  @Post('mall-categories/assign')
  assignMallCategory(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.mallSheets.assignCategory(organizationId, body);
  }

  /** 고른 판매상품으로 채운 몰 양식 파일. 몰에 올리지 않는다 — 사람이 몰 판매자센터에 올린다. */
  @Post('mall-sheets/:sheetKey/file')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async mallSheetFile(
    @CurrentOrganization() organizationId: string,
    @Param('sheetKey') sheetKey: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.mallSheets.file(organizationId, sheetKey, body);
    response.setHeader('Content-Disposition', contentDisposition(file.fileName));
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('X-Mall-Sheet-Products', String(file.products));
    response.setHeader('X-Mall-Sheet-Rows', String(file.rows));
    return new StreamableFile(file.buffer);
  }

  /** 판매상품 사진 중 몰이 못 읽는(우리 저장소) 사진 주소 — 확장이 공개 저장소에 올린다. */
  @Post('public-images/pending')
  pendingPublicImages(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.mallSheets.pendingPublicImages(organizationId, body);
  }

  /** 확장이 올린 공개 사진 주소를 저장한다. 판매상품의 사진 주소는 바꾸지 않는다. */
  @Post('public-images')
  savePublicImages(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.mallSheets.savePublicImages(organizationId, body);
  }

  /** 몰 가격이 판매상품 기준과 다른 상품 × 몰 — 몰별 값으로 가져오면 무엇이 바뀌는지(쓰지 않는다). */
  @Get('mall-prices/adoption')
  previewMallPriceAdoption(@CurrentOrganization() organizationId: string) {
    return this.mallPrices.adopt(organizationId, false);
  }

  /** 몰 가격을 몰별 값으로 저장한다. 몰은 건드리지 않는다. */
  @Post('mall-prices/adoption')
  applyMallPriceAdoption(@CurrentOrganization() organizationId: string) {
    return this.mallPrices.adopt(organizationId, true);
  }

  /** 이 몰에서 판매상품이 쓴 사방넷 분류 — 등록 화면의 분류 칸 고를거리. */
  @Get('mall-categories')
  mallCategories(
    @CurrentOrganization() organizationId: string,
    @Query('mallKey') mallKey?: string,
  ) {
    if (!mallKey?.trim()) throw new BadRequestException('mallKey 가 필요합니다.');
    return this.salesProducts.mallCategories(organizationId, mallKey.trim());
  }

  /** 사방넷 서버에 남아 있어 옮겨야 하는 사진 수. */
  @Get('images/external')
  externalImages(@CurrentOrganization() organizationId: string) {
    return this.images.external(organizationId);
  }

  /** 사방넷 서버 사진을 한 묶음 우리 저장소로 옮긴다. 결과의 `nextSkip` 으로 다음 묶음을 부른다. */
  @Post('images/mirror')
  mirrorImages(
    @CurrentOrganization() organizationId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.images.mirror(organizationId, { limit: optionalInt(limit), skip: optionalInt(skip) });
  }

  /** 몰에 올라간 상품을 판매상품과 잇는다(코드가 정확히 같을 때만). `dryRun=true` 면 세기만 한다. */
  @Post('links/auto')
  autoLink(
    @CurrentOrganization() organizationId: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return dryRun === 'true'
      ? this.links.preview(organizationId)
      : this.links.autoLink(organizationId);
  }

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

  /** 수집상품 화면의 몰 대량등록 — 고른 수집상품을 판매상품으로 만든다(이미 만든 것은 그대로 쓴다). */
  @Post('from-candidates')
  createFromCandidates(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.salesProducts.createFromCandidates(organizationId, body);
  }

  @Post('imports/sabangnet')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
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

function optionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException('limit · skip 은 0 이상의 정수입니다.');
  return parsed;
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
