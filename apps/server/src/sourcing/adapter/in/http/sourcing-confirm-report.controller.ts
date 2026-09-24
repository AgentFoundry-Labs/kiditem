import { Controller, Get, Post } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { SourcingConfirmReportService } from '../../../application/service/sourcing-confirm-report.service';

/**
 * 사장님 컨펌 보고. 보내기는 로그인한 사람이 누를 때만 일어나고, 답장 반영은 서버 루프가 한다.
 */
@Controller('sourcing/workspace/confirm-report')
export class SourcingConfirmReportController {
  constructor(private readonly reports: SourcingConfirmReportService) {}

  // 채팅 ID · 설정 토큰 대기 여부는 owner · admin 에게만 싣는다.
  @Get('status')
  status(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.reports.status(organizationId, user.role);
  }

  // 사장님 채팅으로 실제 메시지가 나간다. 보내기는 owner · admin 만 한다.
  @Post('telegram')
  @Roles('owner', 'admin')
  sendTelegram(@CurrentOrganization() organizationId: string) {
    return this.reports.sendReport(organizationId);
  }

  // 채팅을 정하는 1회용 토큰. 받은 사람이 텔레그램에서 /start <토큰> 을 보낸다.
  @Post('telegram/setup-token')
  @Roles('owner', 'admin')
  issueSetupToken(@CurrentOrganization() organizationId: string) {
    return this.reports.issueSetupToken(organizationId);
  }
}
