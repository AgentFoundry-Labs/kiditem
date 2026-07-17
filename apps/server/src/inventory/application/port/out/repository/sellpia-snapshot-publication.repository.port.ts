import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type {
  SellpiaInventoryQualityFact,
} from '../../../../domain/policy/sellpia-inventory-quality.policy';
import type { ParsedSellpiaInventoryRow } from '../../../service/sellpia-inventory-workbook.parser';
import type {
  SellpiaPublicationExecution,
} from './sellpia-import-run.repository.port';

type PublicationScope = {
  organizationId: string;
  userId: string;
  runId: string;
  fileHash: string;
  execution: SellpiaPublicationExecution;
};

export type SellpiaSnapshotPublicationChanges = {
  createdSkuCount: number;
  updatedSkuCount: number;
  inactivatedSkuCount: number;
};

export type SellpiaSnapshotPublicationResult = Omit<
  SellpiaInventoryImportResponse,
  'changes'
> & {
  changes: SellpiaSnapshotPublicationChanges;
};

export interface SellpiaSnapshotPublicationRepositoryPort {
  publishSnapshot(input: PublicationScope & {
    attemptToken: string;
    rows: ParsedSellpiaInventoryRow[];
    qualityFacts: SellpiaInventoryQualityFact[];
    confirmedReferencedProductCodes: string[];
  }): Promise<SellpiaSnapshotPublicationResult>;

  verifySameHash(
    input: PublicationScope,
  ): Promise<SellpiaSnapshotPublicationResult>;
}

export const SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT = Symbol(
  'SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT',
);
