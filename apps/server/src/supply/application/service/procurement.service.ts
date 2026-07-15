import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PROCUREMENT_REPOSITORY_PORT,
  type ProcurementRepositoryPort,
  type PurchaseOrderCreateCommand,
  type PurchaseOrderListQuery,
} from '../port/out/repository/procurement.repository.port';
import {
  isValidPurchaseOrderTransition,
} from '../../domain/policy/purchase-order-status';
import {
  PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT,
  type PurchaseOrderSubmissionTransactionPort,
} from '../port/out/transaction/purchase-order-submission.transaction.port';

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(PROCUREMENT_REPOSITORY_PORT)
    private readonly procurement: ProcurementRepositoryPort,
    @Inject(PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT)
    private readonly submissionTransaction: PurchaseOrderSubmissionTransactionPort,
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

  async delete(organizationId: string, id: string) {
    const result = await this.submissionTransaction.deletePurchaseOrder({
      organizationId,
      purchaseOrderId: id,
    });
    if (result.kind === 'not_found') {
      throw new BadRequestException('발주를 찾을 수 없습니다');
    }
    if (result.kind === 'not_deletable') {
      throw new BadRequestException(
        '임시저장 또는 대기 상태의 발주만 삭제할 수 있습니다',
      );
    }
    if (result.kind === 'unresolved_attempt') {
      throw new BadRequestException(
        '미해결 외부 주문 시도가 있어 발주를 삭제할 수 없습니다',
      );
    }
    return result.order;
  }
}
