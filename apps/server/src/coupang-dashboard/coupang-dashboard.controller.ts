import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CoupangDashboardService } from './coupang-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('coupang-dashboard')
export class CoupangDashboardController {
  constructor(
    private readonly service: CoupangDashboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getSummary() {
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!company) {
      throw new NotFoundException('회사 정보 없음');
    }
    return this.service.getSummary(company.id);
  }
}
