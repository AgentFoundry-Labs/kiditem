export interface ChannelCatalogPublicationResult {
  sourceImportRunId: string;
  duplicate: boolean;
  changes: Record<string, number>;
}

export interface ChannelCatalogPublicationPort {
  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    collectionRunId: string;
    snapshotHash: string;
    chunkSetHash: string;
  }): Promise<ChannelCatalogPublicationResult>;
}

export const CHANNEL_CATALOG_PUBLICATION_PORT = Symbol('CHANNEL_CATALOG_PUBLICATION_PORT');
