import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProcessingCostDto, UpdateProcessingCostDto } from './dto';

@Injectable()
export class ProcessingCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, status?: string) {
    const where: Record<string, unknown> = { companyId };
    if (status) {
      where.status = status;
    }

    return this.prisma.processingCost.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateProcessingCostDto) {
    const totalCost = dto.unitCost * dto.quantity;

    return this.prisma.processingCost.create({
      data: {
        companyId,
        productId: dto.productId,
        processType: dto.processType,
        unitCost: dto.unitCost,
        quantity: dto.quantity,
        totalCost,
        vendor: dto.vendor,
        date: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
      },
      include: { product: true },
    });
  }

  async update(id: string, dto: UpdateProcessingCostDto) {
    const existing = await this.prisma.processingCost.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('가공비를 찾을 수 없습니다');
    }

    return this.prisma.processingCost.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  /** 월별 가공비 집계: status별 totalCost 합산 */
  async monthly(companyId: string) {
    const costs = await this.prisma.processingCost.findMany({
      where: { companyId },
      select: { date: true, totalCost: true, status: true },
      orderBy: { date: 'desc' },
    });

    const monthMap = new Map<string, { pending: number; completed: number; paid: number; total: number }>();

    for (const cost of costs) {
      const month = `${cost.date.getFullYear()}-${String(cost.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(month)) {
        monthMap.set(month, { pending: 0, completed: 0, paid: 0, total: 0 });
      }
      const entry = monthMap.get(month)!;
      entry.total += cost.totalCost;
      if (cost.status === 'pending') entry.pending += cost.totalCost;
      else if (cost.status === 'completed') entry.completed += cost.totalCost;
      else if (cost.status === 'paid') entry.paid += cost.totalCost;
    }

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }
}
