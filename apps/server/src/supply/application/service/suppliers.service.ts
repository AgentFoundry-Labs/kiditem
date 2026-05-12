import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../../adapter/in/http/dto';

/**
 * Suppliers stay as transitional legacy CRUD inside the supply owner domain.
 * Per the backend architecture contract, ports are deferred for tiny CRUD that
 * is not being reconstructed in this PR. Future supplier-side reconstruction
 * may add ports/adapters; the controller and route are already housed under
 * supply.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { organizationId },
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

  async create(organizationId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        organizationId,
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

  async update(id: string, organizationId: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    const { count } = await this.prisma.supplier.updateMany({
      where: { id, organizationId },
      data: this.buildUpdateData(dto),
    });
    if (count === 0) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    const updated = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!updated) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    return updated;
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    const { count } = await this.prisma.supplier.deleteMany({
      where: { id, organizationId },
    });
    if (count === 0) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }
    return { ok: true };
  }

  private buildUpdateData(dto: UpdateSupplierDto) {
    return {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.contactName !== undefined && { contactName: dto.contactName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.leadTimeDays !== undefined && { leadTimeDays: dto.leadTimeDays }),
      ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.status !== undefined && { status: dto.status }),
    };
  }
}
