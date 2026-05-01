import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';

type SupplierPaymentRow = {
  id: string;
  supplierId: string;
  supplierName: string | null;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: Date | null;
  paidDate?: Date | null;
  purchaseOrderId?: string | null;
  notes: string | null;
  createdAt: Date;
  supplier?: { id: string; name: string } | null;
};

type SupplierPaymentReportItem = Omit<SupplierPaymentRow, 'supplier'> & {
  supplierName: string;
};

type SupplierSettlementRow = {
  supplierId: string;
  supplierName: string;
  totalOrdered: number;
  totalPaid: number;
  unpaid: number;
  orderCount: number;
  receivedCount: number;
  status: 'unpaid' | 'partial' | 'paid';
};

function normalizePayment(payment: SupplierPaymentRow): SupplierPaymentReportItem {
  const { supplier, ...rest } = payment;
  return {
    ...rest,
    supplierName: payment.supplierName ?? supplier?.name ?? '-',
  };
}

function summarizePayments(items: SupplierPaymentReportItem[]) {
  return items.reduce(
    (summary, item) => ({
      totalAmount: summary.totalAmount + item.amount,
      totalPaid: summary.totalPaid + item.paidAmount,
      totalUnpaid: summary.totalUnpaid + Math.max(item.amount - item.paidAmount, 0),
    }),
    { totalAmount: 0, totalPaid: 0, totalUnpaid: 0 },
  );
}

function countPayments(items: SupplierPaymentReportItem[]) {
  return items.reduce(
    (counts, item) => ({
      ...counts,
      all: counts.all + 1,
      [item.status]: (counts[item.status as keyof typeof counts] ?? 0) + 1,
    }),
    { all: 0, unpaid: 0, partial: 0, paid: 0 },
  );
}

function buildSettlementRows(items: SupplierPaymentReportItem[]): SupplierSettlementRow[] {
  const rows = new Map<string, SupplierSettlementRow>();
  for (const item of items) {
    const row = rows.get(item.supplierId) ?? {
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      totalOrdered: 0,
      totalPaid: 0,
      unpaid: 0,
      orderCount: 0,
      receivedCount: 0,
      status: 'unpaid' as const,
    };
    row.totalOrdered += item.amount;
    row.totalPaid += item.paidAmount;
    row.unpaid += Math.max(item.amount - item.paidAmount, 0);
    row.orderCount += 1;
    if (item.status === 'paid') row.receivedCount += 1;
    row.status = row.unpaid <= 0 && row.totalPaid > 0
      ? 'paid'
      : row.totalPaid > 0
        ? 'partial'
        : 'unpaid';
    rows.set(item.supplierId, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.unpaid - a.unpaid || a.supplierName.localeCompare(b.supplierName));
}

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

  async getReport(organizationId: string, status?: string) {
    const payments = await this.findAll(organizationId, status) as SupplierPaymentRow[];
    const items = payments.map(normalizePayment);
    return {
      summary: summarizePayments(items),
      counts: countPayments(items),
      settlements: buildSettlementRows(items),
      items,
    };
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
