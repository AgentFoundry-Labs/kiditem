import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { PickingService } from './picking.service';
import { ListPickingQueryDto, GeneratePickingDto, UpdatePickingItemDto } from './dto';

@Controller('picking')
export class PickingController {
  constructor(
    private readonly pickingService: PickingService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListPickingQueryDto) {
    return this.pickingService.findAll(
      await this.companyResolver.resolve(),
    );
  }

  @Post('generate')
  generate(@Body() dto: GeneratePickingDto) {
    return this.pickingService.generate(dto.companyId);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePickingItemDto,
  ) {
    return this.pickingService.updateItem(id, itemId, dto);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.pickingService.complete(id);
  }
}
