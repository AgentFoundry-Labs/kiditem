export type ChannelCatalogMedia = Readonly<{
  sourceUrl: string;
  role: 'primary' | 'detail' | 'option';
  sortOrder: number;
  /**
   * The v1 single-option association. Keep this field for older publishers
   * and receipts; new publishers should prefer externalOptionIds when one
   * provider image is shared by more than one option.
   */
  externalOptionId: string | null;
  externalOptionIds?: readonly string[];
}>;

export type CatalogMediaPublicationScope = 'basic' | 'detail' | 'option';

/**
 * A server-verified provider option identity promotion.  The value is nested
 * on one listing in the publication request, so a basic refresh can repair
 * old fallback IDs in that listing's provider-media metadata without
 * broadening the media publisher into an identity resolver.
 */
export type CatalogMediaOptionIdentityRemap = Readonly<{
  oldExternalOptionId: string;
  newExternalOptionId: string;
}>;

export interface CatalogMediaPublicationPort {
  publishProviderMedia(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    publicationReference: {
      type: 'source_import_run';
      id: string;
    };
    /**
     * Omitted means the legacy full publication semantics. A basic stage
     * replaces provider primary media only; a detail stage replaces provider
     * detail media, and an option publication replaces provider option media.
     * Narrow scopes keep an omitted role from being interpreted as a deletion.
     */
    publicationScope?: CatalogMediaPublicationScope;
    listings: Array<{
      listingId: string;
      channel: string;
      displayName: string;
      /**
       * Exact option-identity promotions already verified by Channels.  The
       * media adapter only rewrites matching provider-media metadata; it
       * never changes listing-option rows or resolves identities itself.
       */
      optionIdentityRemaps?: readonly CatalogMediaOptionIdentityRemap[];
      media: ChannelCatalogMedia[];
    }>;
  }): Promise<{
    imageCount: number;
    inactivatedImageCount: number;
  }>;
}

export const CATALOG_MEDIA_PUBLICATION_PORT = Symbol(
  'CATALOG_MEDIA_PUBLICATION_PORT',
);
