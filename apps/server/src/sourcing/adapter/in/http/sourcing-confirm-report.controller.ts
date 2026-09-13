import { Controller, Get, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingConfirmReportService } from '../../../application/service/sourcing-confirm-report.service';

/**
 * 사장님 컨펌 보고. 보내기는 로그인한 사람이 누를 때만 일어나고, 답장 반영은 서버 루프가 한다.
 */
@Controller('sourcing/workspace/confirm-report')
export class SourcingConfirmReportController {
  constructor(private readonly reports: SourcingConfirmReportService) {}

  @Get('status')
  status(@CurrentOrganization() organizationId: string) {
    return this.reports.status(organizationId);
  }

  @Post('telegram')
  sendTelegram(@CurrentOrganization() organizationId: string) {
    return this.reports.sendReport(organizationId);
  }
}
