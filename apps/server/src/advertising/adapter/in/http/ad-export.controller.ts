import {
  Body,
  Controller,
  Header,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { AdExportService } from '../../../application/service/ad-export.service';
import { AdCampaignExportDto, AdTrendExportDto } from './dto';
import type { Response } from 'express';

@Controller('ads/exports')
export class AdExportController {
  constructor(private readonly exporter: AdExportService) {}

  @Post('campaign')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  exportCampaign(
    @Body() body: AdCampaignExportDto,
    @CurrentOrganization() _organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    return this.writeResponse(response, this.exporter.exportCampaign(body));
  }

  @Post('trend')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  exportTrend(
    @Body() body: AdTrendExportDto,
    @CurrentOrganization() _organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    return this.writeResponse(response, this.exporter.exportTrend(body));
  }

  private writeResponse(
    response: Response,
    result: ReturnType<AdExportService['exportCampaign']>,
  ): StreamableFile {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', contentDisposition(result.fileName));
    response.setHeader('Content-Type', result.contentType);
    return new StreamableFile(result.buffer);
  }
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
