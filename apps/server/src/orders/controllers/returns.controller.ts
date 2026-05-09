import { Controller, Get, Post, Body, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { ReturnsService } from '../services/returns.service';
import { ListReturnsQueryDto, ReturnActionBodyDto } from '../dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { isCoupangCredentialResolutionError } from '../../channels/application/service/channel-account.service';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListReturnsQueryDto) {
    return this.returnsService.findAll(organizationId, query);
  }

  @Get('stats')
  getStats(@CurrentOrganization() organizationId: string) {
    return this.returnsService.getStats(organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.returnsService.findOne(id, organizationId);
  }

  @Post()
  async handleAction(
    @Body() body: ReturnActionBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    try {
      return await this.returnsService.approve(body.receiptId, organizationId);
    } catch (err) {
      if (isCoupangCredentialResolutionError(err)) throw err;
      throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
    }
  }
}
