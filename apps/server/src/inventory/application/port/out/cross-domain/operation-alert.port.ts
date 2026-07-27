export const INVENTORY_OPERATION_ALERT_PORT = Symbol(
  'INVENTORY_OPERATION_ALERT_PORT',
);

export type InventoryOperationAlertSeverity =
  | 'info'
  | 'warning'
  | 'error'
  | 'critical';

export interface InventoryOperationLifecyclePatch {
  message?: string | null;
  href?: string | null;
  progress?: number | null;
  severity?: InventoryOperationAlertSeverity;
  metadata?: Record<string, unknown>;
}

export interface InventoryOperationAlertPort {
  fail(
    organizationId: string,
    operationKey: string,
    patch?: InventoryOperationLifecyclePatch,
  ): Promise<unknown>;
}
