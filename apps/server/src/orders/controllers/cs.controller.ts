import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CsService } from '../services/cs.service';
import { ListCsQueryDto, CreateCsBodyDto } from '../dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('cs')
export class CsController {
  constructor(private readonly csService: CsService) {}

  @Get()
  findAll(@Query() query: ListCsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.csService.findAll(query, organizationId);
  }

  @Post()
  create(@Body() body: CreateCsBodyDto, @CurrentOrganization() organizationId: string) {
    return this.csService.create(body, organizationId);
  }
}
