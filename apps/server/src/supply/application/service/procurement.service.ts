import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError, KiditemInvalidValueError, KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
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
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'SUPPLIER_NOT_FOUND' },
        message: '거래처를 찾을 수 없거나 권한이 없습니다.',
      });
    }

    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'MASTER_PRODUCT_NOT_FOUND', masterProductIds: result.missingMasterProductIds },
      message: '발주 항목의 상품을 찾을 수 없거나 권한이 없습니다.',
    });
  }

  async updateStatus(organizationId: string, id: string, newStatus: string) {
    if (newStatus === 'ordered') {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'SUBMIT_ACTION_REQUIRED' },
        message: '발주 확정은 발주 제출로만 할 수 있습니다.',
      });
    }
    const order = await this.procurement.findScopedStatus(organizationId, id);
    if (!order) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'purchase_order' } });
    }

    if (!isValidPurchaseOrderTransition(order.status, newStatus)) {
      throw new KiditemConflictError('SUPPLY_PURCHASE_STATUS_INVALID', {
        details: { reason: 'TRANSITION_INVALID', from: order.status, to: newStatus },
      });
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
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'purchase_order' } });
    }
    return updated;
  }

  async getPurchaseOrderCheckoutSnapshot(organizationId: string, id: string) {
    const order = await this.procurement.findCheckoutSnapshot(organizationId, id);
    if (!order) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'purchase_order' } });
    }
    return order;
  }

  async delete(organizationId: string, id: string) {
    const result = await this.submissionTransaction.deletePurchaseOrder({
      organizationId,
      purchaseOrderId: id,
    });
    if (result.kind === 'not_found') {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'purchase_order' } });
    }
    if (result.kind === 'not_deletable') {
      throw new KiditemConflictError('SUPPLY_PURCHASE_STATUS_INVALID', { details: { reason: 'NOT_DELETABLE' } });
    }
    if (result.kind === 'unresolved_attempt') {
      throw new KiditemPreconditionError('SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED', { details: { reason: 'UNRESOLVED_ATTEMPT' } });
    }
    return result.order;
  }
}
