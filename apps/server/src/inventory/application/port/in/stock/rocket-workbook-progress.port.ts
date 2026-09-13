/**
 * Server-side state of one exported Rocket workbook workflow. Supply reads it
 * to fence a new export and abandonment; no client receives it.
 */
export type RocketWorkbookWorkflowStatus =
  | 'awaiting_coupang_confirmation'
  | 'orders_collected'
  | 'sellpia_transmitting'
  | 'awaiting_inventory_sync'
  | 'completed'
  | 'failed';

export interface RocketWorkbookProgressPort {
  read(input: {
    transaction: unknown;
    organizationId: string;
    exportGeneration: bigint | null;
    allPositiveLinesCollected: boolean;
    intentKeys: string[];
  }): Promise<{
    status: RocketWorkbookWorkflowStatus;
    verifiedGeneration: bigint;
  }>;
}

export const ROCKET_WORKBOOK_PROGRESS_PORT = Symbol(
  'ROCKET_WORKBOOK_PROGRESS_PORT',
);
