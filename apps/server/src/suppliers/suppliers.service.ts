import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId },
      include: {
        _count: {
          select: {
            supplierProducts: true,
            masterSupplierProducts: true,
            purchaseOrders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return suppliers.map(({ _count, ...rest }) => ({
      ...rest,
      productCount: _count.supplierProducts + _count.masterSupplierProducts,
      orderCount: _count.purchaseOrders,
    }));
  }

  async create(companyId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        companyId,
        name: dto.name,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        leadTimeDays: dto.leadTimeDays,
        paymentTerms: dto.paymentTerms,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.leadTimeDays !== undefined && { leadTimeDays: dto.leadTimeDays }),
        ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async delete(id: string, companyId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }
}
