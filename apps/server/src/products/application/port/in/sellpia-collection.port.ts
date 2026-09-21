import type {
  SellpiaInventoryCollectionTrigger,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_COLLECTION_PORT = Symbol('SELLPIA_COLLECTION_PORT');

export type SellpiaCollectionPlan = {
  sourceType: 'sellpia_inventory';
  parserVersion: 'sellpia-inventory-v1';
  scope: SellpiaSyncScope;
  trigger: SellpiaInventoryCollectionTrigger;
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  generation: string;
};

export type SellpiaCollectionAttempt = {
  attemptId: string;
  attemptToken: string;
  generation: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: SellpiaCollectionPlan;
  expiresAt: string;
  actualCutoffAt: string | null;
  fileName: string | null;
  fileHash: string | null;
  contentChecksum: string | null;
  rowCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export interface SellpiaCollectionPort {
  beginAttempt(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    scope: SellpiaSyncScope;
    trigger?: SellpiaInventoryCollectionTrigger;
  }): Promise<SellpiaCollectionAttempt>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaCollectionAttempt>;

  completeAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    file: { buffer: Buffer; fileName: string; mimeType: string };
  }): Promise<SellpiaCollectionAttempt>;

  failAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaCollectionAttempt>;

  /** Operator stop without the attempt token; terminal attempts are idempotent. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaCollectionAttempt>;
}
