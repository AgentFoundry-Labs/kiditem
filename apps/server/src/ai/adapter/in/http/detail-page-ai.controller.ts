import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { DetailPageAiService } from '../../../application/service/detail-page-ai.service';
import { GenerateDetailPageBodyDto } from './dto';

@Controller('ai/detail-page')
export class DetailPageAiController {
  constructor(private readonly service: DetailPageAiService) {}

  @Post('generate')
  generate(
    @Body() body: GenerateDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.generate(body, organizationId);
  }

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query('productId') productId?: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.service.list(organizationId, productId, templateId);
  }

  @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getById(id, organizationId);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.remove(id, organizationId);
  }
}
