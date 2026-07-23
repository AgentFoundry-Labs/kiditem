import type { RocketWorkbookWorkflowStatus } from '@kiditem/shared/rocket-purchase-preview';

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
