import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';

import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  COUPANG_SHIPMENTS_PORT,
  type CoupangShipmentsPort,
} from '../../../application/port/in/fulfillment';
import { SaveCoupangShipmentDateSummaryDto } from './dto';

@Controller('coupang-shipments')
export class CoupangShipmentsController {
  constructor(
    @Inject(COUPANG_SHIPMENTS_PORT)
    private readonly coupangShipments: CoupangShipmentsPort,
  ) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.coupangShipments.listLocalFiles(organizationId);
  }

  @Get('date-summary')
  listDateSummary(@CurrentOrganization() organizationId: string) {
    return this.coupangShipments.listDateSummary(organizationId);
  }

  @Put('date-summary')
  saveDateSummary(
    @CurrentOrganization() organizationId: string,
    @Body() dto: SaveCoupangShipmentDateSummaryDto,
  ) {
    return this.coupangShipments.saveDateSummary(organizationId, dto.items);
  }

  @Get('files/:runId/:date/:fileName')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async download(
    @CurrentOrganization() organizationId: string,
    @Param('runId') runId: string,
    @Param('date') date: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.coupangShipments.resolveLocalFile(organizationId, {
      runId,
      date,
      fileName,
    });
    response.setHeader('Content-Disposition', contentDispositionAttachment(file.fileName));
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(file.sizeBytes));
    return new StreamableFile(createReadStream(file.path));
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
