import type {
  SellpiaInventoryQualityFact,
} from '../../../../domain/policy/product-source-quality.policy';
import type { ParsedProductSourceRow } from '../source/sellpia-payload-decoder.port';
import type { SellpiaOwnerBrowserExecution } from './product-source-collection.repository.port';

export type SellpiaSnapshotPublicationChanges = {
  createdProductCount: number;
  updatedProductCount: number;
  inactivatedProductCount: number;
};

export type SellpiaSnapshotPublicationInput = {
  organizationId: string;
  userId: string;
  runId: string;
  attemptToken: string;
  fileHash: string;
  fileName?: string;
  contentChecksum?: string;
  contentByteCount?: number;
  execution: SellpiaOwnerBrowserExecution;
  rows: ParsedProductSourceRow[];
  qualityFacts: SellpiaInventoryQualityFact[];
};

export interface ProductSourcePublicationRepositoryPort {
  publishSnapshot(
    input: SellpiaSnapshotPublicationInput,
  ): Promise<SellpiaSnapshotPublicationChanges>;
}

export const PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT = Symbol(
  'PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT',
);
