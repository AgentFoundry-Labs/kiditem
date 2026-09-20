import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INVENTORY_TRANSACTIONAL_READ_PORT,
  type InventoryTransactionalReadPort,
} from '../../inventory/application/port/in/stock/inventory-transactional-read.port';
import { readOrderIdentityFact } from '../read/order-facts.reader';
import { CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Injectable()
export class ReturnTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: InventoryTransactionalReadPort,
  ) {}

  private generateRtNumber(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `RT-${yy}${mm}${dd}-${Date.now()}`;
  }

  async findAll(organizationId: string, query: { status?: string }) {
    const where: Record<string, unknown> = { organizationId };
    if (query.status) where.status = query.status;

    return this.prisma.$transaction(async (tx) =>
      hydrateInventorySkus(
        tx,
        organizationId,
        this.inventoryTransactionalRead,
        await tx.returnTransfer.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
  }

  async create(organizationId: string, dto: CreateReturnTransferDto) {
    return this.prisma.$transaction(async (tx) => {
      const [sellpiaInventorySku] = await this.inventoryTransactionalRead.readSkuIdentities(
        { client: tx },
        {
        organizationId,
        selector: { kind: 'ids', values: [dto.sellpiaInventorySkuId] },
        },
      );
      if (!sellpiaInventorySku?.isActive) {
        throw new NotFoundException('Sellpia inventory SKU not found');
      }
      if (dto.orderId) {
        const order = await readOrderIdentityFact(
          tx,
          organizationId,
          dto.orderId,
        );
        if (!order) throw new NotFoundException('Order not found');
      }

      const rtNumber = this.generateRtNumber();

      const created = await tx.returnTransfer.create({
        data: {
          organizationId,
          rtNumber,
          orderId: dto.orderId,
          sellpiaInventorySkuId: dto.sellpiaInventorySkuId,
          optionName: sellpiaInventorySku.optionName,
          quantity: dto.quantity,
          condition: dto.condition ?? 'good',
          notes: dto.notes,
        },
      });
      return (await hydrateInventorySkus(
        tx,
        organizationId,
        this.inventoryTransactionalRead,
        [created],
      ))[0]!;
    });
  }

  async update(
    id: string,
    dto: UpdateReturnTransferDto,
    organizationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.returnTransfer.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundException('반품을 찾을 수 없습니다');
      const updated = await tx.returnTransfer.update({
        where: { id },
        data: {
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.condition !== undefined && { condition: dto.condition }),
          ...(dto.restockedQty !== undefined && {
            restockedQty: dto.restockedQty,
          }),
          ...(dto.disposedQty !== undefined && {
            disposedQty: dto.disposedQty,
          }),
          ...(dto.processedBy !== undefined && {
            processedBy: dto.processedBy,
          }),
        },
      });
      return (await hydrateInventorySkus(
        tx,
        organizationId,
        this.inventoryTransactionalRead,
        [updated],
      ))[0]!;
    });
  }
}

async function hydrateInventorySkus<
  T extends { sellpiaInventorySkuId: string },
>(
  tx: object,
  organizationId: string,
  inventory: InventoryTransactionalReadPort,
  rows: T[],
) {
  const identities = await inventory.readSkuIdentities(
    { client: tx },
    {
      organizationId,
      selector: {
        kind: 'ids',
        values: [
          ...new Set(
            rows.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId),
          ),
        ],
      },
    },
  );
  const byId = new Map(
    identities.map((identity) => [identity.sellpiaInventorySkuId, identity]),
  );
  return rows.map((row) => {
    const identity = byId.get(row.sellpiaInventorySkuId);
    return {
      ...row,
      sellpiaInventorySku: identity
        ? {
            id: identity.sellpiaInventorySkuId,
            code: identity.code,
            name: identity.name,
            optionName: identity.optionName,
            barcode: identity.barcode,
          }
        : null,
    };
  });
}
