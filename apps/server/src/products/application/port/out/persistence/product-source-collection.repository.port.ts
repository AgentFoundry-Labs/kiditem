import type {
  SellpiaCollectionAttempt,
} from '../../in/sellpia-collection.port';
import type {
  SellpiaInventoryCollectionTrigger,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export type SellpiaOwnerBrowserExecution = {
  kind: 'browser';
  claimToken: string;
  activeGeneration: string;
  trigger: SellpiaInventoryCollectionTrigger;
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  /** The server-issued attempt owns the publication lease. */
  ownerAttempt: true;
};

export interface ProductSourceCollectionRepositoryPort {
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

  failAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
    fileName?: string;
    contentChecksum?: string;
  }): Promise<SellpiaCollectionAttempt>;

  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaCollectionAttempt>;
}

export const PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT = Symbol(
  'PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT',
);
