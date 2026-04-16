import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePickingItemDto } from './dto';

@Injectable()
export class PickingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.pickingList.findMany({
      where: { companyId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 확인된 주문으로부터 피킹 리스트 생성 */
  async generate(companyId: string) {
    const orders = await this.prisma.order.findMany({
      where: { companyId, status: 'confirmed' },
      include: { product: true },
    });

    if (orders.length === 0) {
      throw new BadRequestException('피킹 대상 주문이 없습니다 (status=confirmed)');
    }

    const listNumber = `PK-${Date.now()}`;

    const pickingList = await this.prisma.pickingList.create({
      data: {
        companyId,
        listNumber,
        totalItems: orders.length,
        items: {
          create: orders.map((order) => ({
            orderId: order.id,
            productId: order.productId ?? '',
            productName: order.productName,
            sku: order.product?.sku ?? undefined,
            quantity: order.quantity,
            location: undefined,
          })),
        },
      },
      include: { items: true },
    });

    return pickingList;
  }

  async updateItem(
    listId: string,
    itemId: string,
    companyId: string,
    dto: UpdatePickingItemDto,
  ) {
    // PickingItem 에는 companyId 컬럼이 없으므로 PickingList 를 경유해 소유권 검증 (IDOR 방어)
    const list = await this.prisma.pickingList.findFirst({
      where: { id: listId, companyId },
      select: { id: true },
    });
    if (!list) {
      throw new NotFoundException('피킹 리스트를 찾을 수 없습니다');
    }

    const item = await this.prisma.pickingItem.findFirst({
      where: { id: itemId, pickingListId: listId },
    });
    if (!item) {
      throw new BadRequestException('피킹 아이템을 찾을 수 없습니다');
    }

    const data: Record<string, unknown> = {};
    if (dto.isPicked !== undefined) {
      data.isPicked = dto.isPicked;
      if (dto.isPicked) data.pickedAt = new Date();
    }
    if (dto.isVerified !== undefined) {
      data.isVerified = dto.isVerified;
      if (dto.isVerified) data.verifiedAt = new Date();
    }

    const updated = await this.prisma.pickingItem.update({
      where: { id: itemId },
      data,
    });

    // pickedItems 카운트 업데이트
    const pickedCount = await this.prisma.pickingItem.count({
      where: { pickingListId: listId, isPicked: true },
    });
    await this.prisma.pickingList.update({
      where: { id: listId },
      data: { pickedItems: pickedCount },
    });

    return updated;
  }

  async complete(id: string, companyId: string) {
    // ADR-0006: findUnique({ where: { id } }) 금지 — companyId 필수
    const list = await this.prisma.pickingList.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!list) {
      throw new NotFoundException('피킹 리스트를 찾을 수 없습니다');
    }

    return this.prisma.pickingList.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: { items: true },
    });
  }
}
