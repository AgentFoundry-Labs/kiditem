import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PickingService } from './picking.service';
import { ListPickingQueryDto, GeneratePickingDto, UpdatePickingItemDto } from './dto';

@Controller('picking')
export class PickingController {
  constructor(
    private readonly pickingService: PickingService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListPickingQueryDto) {
    return this.pickingService.findAll(
      await this.resolveCompanyId(query.companyId),
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
