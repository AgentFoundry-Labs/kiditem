import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../products/application/port/in/product-transactional-read.port';
import { readOrderIdentityFact } from '../read/order-facts.reader';
import { CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Injectable()
export class ReturnTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
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
      hydrateMasterProducts(
        tx,
        organizationId,
        this.productTransactionalRead,
        await tx.returnTransfer.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
  }

  async create(organizationId: string, dto: CreateReturnTransferDto) {
    return this.prisma.$transaction(async (tx) => {
      const masterProductId = dto.masterProductId ?? null;
      if (!masterProductId) {
        throw new NotFoundException(
          'A MasterProduct id is required for new return transfers.',
        );
      }
      const [masterProduct] = await this.productTransactionalRead.readSourceIdentities(
        { client: tx },
        {
          organizationId,
          selector: { kind: 'ids', values: [masterProductId] },
        },
      );
      if (!masterProduct) {
        throw new NotFoundException('MasterProduct not found');
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
          masterProductId,
          optionName: masterProduct.optionName,
          quantity: dto.quantity,
          condition: dto.condition ?? 'good',
          notes: dto.notes,
        },
      });
      return (await hydrateMasterProducts(
        tx,
        organizationId,
        this.productTransactionalRead,
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
      return (await hydrateMasterProducts(
        tx,
        organizationId,
        this.productTransactionalRead,
        [updated],
      ))[0]!;
    });
  }
}

async function hydrateMasterProducts<
  T extends { masterProductId: string | null },
>(
  tx: object,
  organizationId: string,
  products: ProductTransactionalReadPort,
  rows: T[],
) {
  const identities = await products.readSourceIdentities(
    { client: tx },
    {
      organizationId,
      selector: {
        kind: 'ids',
        values: [
          ...new Set(
            rows.flatMap(({ masterProductId }) => (
              masterProductId ? [masterProductId] : []
            )),
          ),
        ],
      },
    },
  );
  const byId = new Map(
    identities.map((identity) => [identity.masterProductId, identity]),
  );
  return rows.map((row) => {
    const identity = row.masterProductId
      ? byId.get(row.masterProductId)
      : undefined;
    return {
      ...row,
      masterProduct: identity?.masterProductId
        ? {
            id: identity.masterProductId,
            code: identity.code,
            name: identity.name,
            optionName: identity.optionName,
            barcode: identity.barcode,
          }
        : null,
    };
  });
}
