export const SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT = Symbol(
  'SourcingCollectionSourceControlRepositoryPort',
);

export interface SourcingCollectionSourceControlRecord {
  sourceKey: string;
  enabled: boolean;
  updatedAt: Date;
}

export interface SourcingCollectionSourceControlRepositoryPort {
  findBySourceKeys(input: {
    organizationId: string;
    sourceKeys: string[];
  }): Promise<SourcingCollectionSourceControlRecord[]>;
  setEnabled(input: {
    organizationId: string;
    sourceKey: string;
    enabled: boolean;
  }): Promise<SourcingCollectionSourceControlRecord>;
}
