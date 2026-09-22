import { describe, expect, it, vi } from 'vitest';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { ChannelListingQueryPersistenceAdapter } from '../channel-listing-query.persistence.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../channel-option-recipe.repository.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../../products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

function fixture() {
  const tx = {
    channelListing: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  // The owner's injected client is deliberately different from the caller's transaction.
  const outside = { channelListing: { findMany: vi.fn() } };
  return { tx, outside, transaction: ownerTransaction(tx as never),
    listings: new ChannelListingQueryPersistenceAdapter(outside as never),
    recipes: new ChannelOptionRecipeRepositoryAdapter(outside as never, {} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())) };
}

describe('Channels cross-owner fact query contracts', () => {
  it('does not widen explicitly empty selectors into an organization-wide read', async () => {
    const { tx, listings, recipes, transaction } = fixture();
    const organizationId = 'org';
    expect(await listings.readCatalogFacts(transaction, { organizationId, listingIds: [] })).toEqual([]);
    expect(await listings.readCatalogFacts(transaction, { organizationId, accountIds: [] })).toEqual([]);
    expect(await listings.readExternalIdentities(transaction, { organizationId, accountId: 'account', optionExternalIds: [], activeOnly: true })).toEqual([]);
    expect(await listings.readRegisteredCandidateIds(transaction, { organizationId, candidateIds: [] })).toEqual([]);
    expect(await recipes.readConfirmedCompositions(transaction, { organizationId, optionIds: [] })).toEqual([]);
    expect(tx.channelListing.findMany).not.toHaveBeenCalled();
    expect(tx.channelListingOption.findMany).not.toHaveBeenCalled();
  });

  it('returns every candidate across accounts instead of silently picking an ambiguous option', async () => {
    const { tx, listings, transaction } = fixture();
    tx.channelListingOption.findMany.mockResolvedValue([
      { id: 'option-a', listingId: 'listing-a', externalOptionId: 'external', itemName: 'A', listing: { channelAccountId: 'account-a' } },
      { id: 'option-b', listingId: 'listing-b', externalOptionId: 'external', itemName: 'B', listing: { channelAccountId: 'account-b' } },
    ] as never);
    const facts = await listings.readOptionCandidates(transaction, { organizationId: 'org', channel: 'coupang', externalOptionIds: ['external'] });
    expect(facts.map(row => row.accountId)).toEqual(['account-a', 'account-b']);
    expect(tx.channelListingOption.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org', listing: expect.objectContaining({ organizationId: 'org', channelAccount: { organizationId: 'org', channel: 'coupang' } }) }),
    }));
  });

  it('rejects ambiguous external option identity inside the selected account', async () => {
    const { tx, listings, transaction } = fixture();
    tx.channelListingOption.findMany.mockResolvedValue([
      { id: 'a', listingId: 'one', externalOptionId: 'duplicate', listing: { externalId: 'first' } },
      { id: 'b', listingId: 'two', externalOptionId: 'duplicate', listing: { externalId: 'second' } },
    ] as never);
    await expect(listings.readExternalIdentities(transaction, { organizationId: 'org', accountId: 'account', optionExternalIds: ['duplicate'], activeOnly: true })).rejects.toThrow('ambiguous');
  });

  it('keeps historical inactive catalog facts and uses the caller transaction', async () => {
    const { tx, outside, listings, transaction } = fixture();
    tx.channelListing.findMany.mockResolvedValue([{ id: 'past', channelAccountId: 'closed', channelAccount: { channel: 'coupang' }, isActive: false, options: [] }] as never);
    const facts = await listings.readCatalogFacts(transaction, { organizationId: 'org', accountIds: ['closed'] });
    expect(facts).toEqual([expect.objectContaining({ id: 'past', isActive: false, accountId: 'closed' })]);
    const query = tx.channelListing.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(query.where).not.toHaveProperty('isActive');
    expect(query.where.channelAccount).toEqual({ organizationId: 'org' });
    expect(outside.channelListing.findMany).not.toHaveBeenCalled();
  });

  it('reads sourcing provenance only through the selling product that owns the listing', async () => {
    const { tx, listings, transaction } = fixture();
    tx.channelListing.findMany.mockResolvedValue([
      { salesProduct: { organizationId: 'org', sourceCandidateId: 'common' } },
      { salesProduct: { organizationId: 'org', sourceCandidateId: 'common' } },
      { salesProduct: null },
      { salesProduct: { organizationId: 'other-org', sourceCandidateId: 'foreign' } },
    ] as never);
    expect(await listings.readRegisteredCandidateIds(transaction, { organizationId: 'org' })).toEqual(['common']);
    expect(await listings.readRegisteredCandidateIds(transaction, { organizationId: 'org', candidateIds: ['common'] })).toEqual(['common']);
  });

  it('locks only the requested active organization owner and rejects a missing owner', async () => {
    const { tx, listings, transaction } = fixture();
    await expect(listings.lockActiveOwner(transaction, { organizationId: 'org', listingId: 'listing' })).rejects.toThrow('not found');
    const sql = tx.$queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('FOR UPDATE');
    expect(sql.sql).toContain('is_active = true');
    expect(sql.values).toEqual(['listing', 'org']);
  });
});
