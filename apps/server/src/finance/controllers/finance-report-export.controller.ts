import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  ProfitLossExportQueryDto,
  ReportExportQueryDto,
  SettlementExportQueryDto,
} from '../dto';
import {
  FinanceReportExportService,
  type FinanceReportExportResult,
} from '../report-export/finance-report-export.service';
import type { Response } from 'express';

/**
 * Fixed Finance/Analytics XLSX download boundary. No workbook payloads cross
 * HTTP. The request's instant decides the default month and which KST days of
 * a month are closed.
 */
@Controller()
export class FinanceReportExportController {
  constructor(private readonly exporter: FinanceReportExportService) {}

  @Get('reports/export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async exportReport(
    @CurrentOrganization() organizationId: string,
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.toStream(
      await this.exporter.exportReport(organizationId, query, new Date()),
      response,
    );
  }

  @Get('profit-loss/export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async exportProfitLoss(
    @CurrentOrganization() organizationId: string,
    @Query() query: ProfitLossExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.toStream(
      await this.exporter.exportProfitLoss(organizationId, query, new Date()),
      response,
    );
  }

  @Get('settlements/reconcile/export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async exportSettlementReconcile(
    @CurrentOrganization() organizationId: string,
    @Query() query: SettlementExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.toStream(
      await this.exporter.exportSettlementReconcile(organizationId, query.period, new Date()),
      response,
    );
  }

  private toStream(
    result: FinanceReportExportResult,
    response: Response,
  ): StreamableFile {
    response.setHeader('Content-Disposition', contentDisposition(result.fileName));
    response.setHeader('Content-Type', result.contentType);
    return new StreamableFile(result.buffer);
  }
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
