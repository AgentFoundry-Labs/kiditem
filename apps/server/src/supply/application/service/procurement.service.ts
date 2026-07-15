import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PROCUREMENT_REPOSITORY_PORT,
  type ProcurementRepositoryPort,
  type PurchaseOrderCreateCommand,
  type PurchaseOrderListQuery,
} from '../port/out/repository/procurement.repository.port';
import {
  isDeletablePurchaseOrderStatus,
  isValidPurchaseOrderTransition,
} from '../../domain/policy/purchase-order-status';

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(PROCUREMENT_REPOSITORY_PORT)
    private readonly procurement: ProcurementRepositoryPort,
  ) {}

  async findAll(organizationId: string, query: PurchaseOrderListQuery) {
    return this.procurement.list(organizationId, query);
  }

  async create(organizationId: string, command: PurchaseOrderCreateCommand) {
    const result = await this.procurement.createDraft(organizationId, command);
    if (result.ok) return result.order;

    if (result.reason === 'supplier_not_found') {
      throw new BadRequestException('거래처를 찾을 수 없거나 권한이 없습니다');
    }

    throw new BadRequestException(
      `발주 항목의 셀피아 상품을 찾을 수 없거나 권한이 없습니다: ${result.missingMasterProductIds.join(', ')}`,
    );
  }

  async updateStatus(organizationId: string, id: string, newStatus: string) {
    if (newStatus === 'ordered') {
      throw new BadRequestException(
        'Use the purchase-order submit action for pending → ordered transitions.',
      );
    }
    const order = await this.procurement.findScopedStatus(organizationId, id);
    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (!isValidPurchaseOrderTransition(order.status, newStatus)) {
      throw new BadRequestException(
        `상태 전환 불가: ${order.status} → ${newStatus}`,
      );
    }

    const updated = await this.procurement.updateStatusScoped(
      organizationId,
      id,
      order.status,
      {
        status: newStatus,
        ...(newStatus === 'received' && { receivedAt: new Date() }),
      },
    );
    if (!updated) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    return updated;
  }

  async getPurchaseOrderCheckoutSnapshot(organizationId: string, id: string) {
    const order = await this.procurement.findCheckoutSnapshot(organizationId, id);
    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    return order;
  }

  async preparePurchaseOrderSubmission(organizationId: string, id: string) {
    const order = await this.procurement.findScopedStatus(organizationId, id);
    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (order.status === 'pending' || order.status === 'ordered') {
      return order;
    }

    if (order.status === 'draft') {
      const pending = await this.procurement.updateStatusScoped(
        organizationId,
        id,
        'draft',
        { status: 'pending' },
      );
      if (!pending) {
        throw new BadRequestException('발주를 찾을 수 없습니다');
      }
      return pending;
    }

    throw new BadRequestException(
      '임시저장 또는 대기 상태의 발주만 제출할 수 있습니다',
    );
  }

  async delete(organizationId: string, id: string) {
    const order = await this.procurement.findScopedForDelete(organizationId, id);
    if (!order) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }

    if (!isDeletablePurchaseOrderStatus(order.status)) {
      throw new BadRequestException(
        '임시저장 또는 대기 상태의 발주만 삭제할 수 있습니다',
      );
    }

    const deleted = await this.procurement.deleteScoped(organizationId, id);
    if (!deleted) {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    return order;
  }
}
