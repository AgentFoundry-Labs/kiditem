import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SupplierCreateCommand,
  SupplierRepositoryPort,
  SupplierUpdateCommand,
} from '../../../application/port/out/repository/supplier.repository.port';

@Injectable()
export class SupplierRepositoryAdapter implements SupplierRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listWithCounts(organizationId: string) {
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

    return suppliers.map(({ _count, ...supplier }) => ({
      ...supplier,
      productCount: _count.supplierProducts + _count.masterSupplierProducts,
      orderCount: _count.purchaseOrders,
    }));
  }

  create(organizationId: string, command: SupplierCreateCommand) {
    return this.prisma.supplier.create({
      data: {
        organizationId,
        name: command.name,
        contactName: command.contactName,
        phone: command.phone,
        email: command.email,
        address: command.address,
        leadTimeDays: command.leadTimeDays,
        paymentTerms: command.paymentTerms,
        notes: command.notes,
      },
    });
  }

  async updateScoped(id: string, organizationId: string, command: SupplierUpdateCommand) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return null;

    const { count } = await this.prisma.supplier.updateMany({
      where: { id, organizationId },
      data: buildSupplierUpdateData(command),
    });
    if (count === 0) return null;

    return this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
  }

  async deleteScoped(id: string, organizationId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return false;

    const { count } = await this.prisma.supplier.deleteMany({
      where: { id, organizationId },
    });
    return count > 0;
  }
}

function buildSupplierUpdateData(command: SupplierUpdateCommand) {
  return {
    ...(command.name !== undefined && { name: command.name }),
    ...(command.contactName !== undefined && { contactName: command.contactName }),
    ...(command.phone !== undefined && { phone: command.phone }),
    ...(command.email !== undefined && { email: command.email }),
    ...(command.address !== undefined && { address: command.address }),
    ...(command.leadTimeDays !== undefined && { leadTimeDays: command.leadTimeDays }),
    ...(command.paymentTerms !== undefined && { paymentTerms: command.paymentTerms }),
    ...(command.notes !== undefined && { notes: command.notes }),
    ...(command.status !== undefined && { status: command.status }),
  };
}
