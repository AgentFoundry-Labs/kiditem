import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { WingRegisterBatchDto, WingRegisterCompleteDto } from './dto/thumbnail-edit.dto';
import { ThumbnailWingService } from '../../../application/service/thumbnail-wing.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisWingController {
  constructor(private readonly wingService: ThumbnailWingService) {}

  @Get('playwriter-status')
  checkPlaywriterStatus(@CurrentOrganization() _organizationId: string) {
    return this.wingService.checkPlaywriterStatus();
  }

  @Post('generations/:id/wing-register/prepare')
  wingRegisterPrepare(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.prepareWingRegistration(id, organizationId);
  }

  @Post('generations/:id/wing-register/complete')
  wingRegisterComplete(
    @Param('id') id: string,
    @Body() body: WingRegisterCompleteDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingService.completeWingRegistration(id, organizationId, body);
  }

  @Post('generations/:id/wing-register')
  wingRegister(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.registerToWing(id, organizationId);
  }

  @Post('generations/wing-register/batch')
  wingRegisterBatch(
    @Body() body: WingRegisterBatchDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingService.batchRegister(body.generationIds, organizationId);
  }

  @Delete('generations/:id/registration-error')
  clearRegistrationError(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.clearRegistrationError(id, organizationId);
  }

  @Post('generations/:id/verify-registration')
  verifyRegistration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.wingService.verifyRegistration(id, organizationId);
  }
}
