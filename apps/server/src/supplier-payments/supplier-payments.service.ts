import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';

@Injectable()
export class SupplierPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, status?: string) {
    const where: Record<string, unknown> = { companyId };
    if (status) {
      where.status = status;
    }

    return this.prisma.supplierPayment.findMany({
      where,
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async create(companyId: string, dto: CreateSupplierPaymentDto) {
    return this.prisma.supplierPayment.create({
      data: {
        companyId,
        supplierId: dto.supplierId,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        purchaseOrderId: dto.purchaseOrderId,
        notes: dto.notes,
      },
      include: { supplier: true },
    });
  }

  async update(id: string, dto: UpdateSupplierPaymentDto) {
    const existing = await this.prisma.supplierPayment.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('거래처 결제를 찾을 수 없습니다');
    }

    return this.prisma.supplierPayment.update({
      where: { id },
      data: {
        ...(dto.paidAmount !== undefined && { paidAmount: dto.paidAmount }),
        ...(dto.paidDate !== undefined && { paidDate: new Date(dto.paidDate) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { supplier: true },
    });
  }
}
