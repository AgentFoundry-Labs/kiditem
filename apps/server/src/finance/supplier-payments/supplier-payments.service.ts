import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';

@Injectable()
export class SupplierPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, status?: string) {
    const where: Prisma.SupplierPaymentWhereInput = { organizationId };
    if (status) {
      where.status = status;
    }

    return this.prisma.supplierPayment.findMany({
      where,
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async create(organizationId: string, dto: CreateSupplierPaymentDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, organizationId },
        select: { id: true },
      });
      if (!purchaseOrder) {
        throw new BadRequestException('발주를 찾을 수 없습니다');
      }
    }

    return this.prisma.supplierPayment.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        purchaseOrderId: dto.purchaseOrderId,
        notes: dto.notes,
      },
      include: { supplier: true },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateSupplierPaymentDto) {
    const result = await this.prisma.supplierPayment.updateMany({
      where: { id, organizationId },
      data: {
        ...(dto.paidAmount !== undefined && { paidAmount: dto.paidAmount }),
        ...(dto.paidDate !== undefined && { paidDate: new Date(dto.paidDate) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('거래처 결제를 찾을 수 없습니다');
    }
    return this.prisma.supplierPayment.findFirstOrThrow({
      where: { id, organizationId },
      include: { supplier: true },
    });
  }
}
