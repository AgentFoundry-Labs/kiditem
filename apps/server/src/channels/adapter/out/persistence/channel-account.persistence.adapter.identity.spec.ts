import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { ChannelAccountPersistenceAdapter } from './channel-account.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('ChannelAccountPersistenceAdapter account identity', () => {
  it('reads provider identity facts within the supplied owner transaction', async () => {
    const rows = [{
      id: 'provider-1',
      externalAccountId: 'seller-1',
      vendorId: 'vendor-1',
      status: 'paused',
    }];
    const tx = { channelAccount: { findMany: vi.fn().mockResolvedValue(rows) } };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.readProviderIdentities(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      channel: 'coupang',
      accountIds: ['provider-1'],
    })).resolves.toEqual(rows);
    expect(tx.channelAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', channel: 'coupang', id: { in: ['provider-1'] } },
      select: { id: true, externalAccountId: true, vendorId: true, status: true },
    });
  });

  it('reads the primary Wing account identity without resolving Open API credentials', async () => {
    const prisma = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-2',
          vendorId: 'vendor-2',
          externalAccountId: 'legacy-vendor-2',
          status: 'active',
          updatedAt: new Date('2026-09-07T00:00:00.000Z'),
        }),
      },
    };
    const repository = new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(repository.getCoupangSettings('org-1')).resolves.toEqual({
      configured: true,
      vendorId: 'vendor-2',
      status: 'active',
      updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    });
    expect(prisma.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        channel: 'coupang',
        isPrimary: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('reads requested account facts inside the supplied transaction, including paused history', async () => {
    const rows = [{ id: 'paused-row', name: 'Old Shop', channel: 'coupang', status: 'paused' }];
    const tx = { channelAccount: { findMany: vi.fn().mockResolvedValue(rows) } };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.findByIds(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      accountIds: ['paused-row', 'foreign-row'],
    })).resolves.toEqual(rows);
    expect(tx.channelAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['paused-row', 'foreign-row'] } },
      select: { id: true, name: true, channel: true, status: true },
    });
  });

  it('resolves an active provider with deterministic fallback ordering and a strict primary filter', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-3',
          channel: 'coupang',
          externalAccountId: null,
          vendorId: 'vendor-3',
        }),
      },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.resolveActiveProvider(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      channel: 'coupang',
      primaryOnly: false,
    })).resolves.toEqual({
      id: 'account-3',
      channel: 'coupang',
      externalAccountId: null,
      vendorId: 'vendor-3',
    });
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', channel: 'coupang', status: 'active' },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, channel: true, externalAccountId: true, vendorId: true },
    });

    tx.channelAccount.findFirst.mockResolvedValue(null);
    await persistence.resolveActiveProvider(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      channel: 'coupang',
      accountId: 'account-3',
      primaryOnly: true,
    });
    expect(tx.channelAccount.findFirst).toHaveBeenLastCalledWith({
      where: {
        organizationId: 'org-1',
        channel: 'coupang',
        status: 'active',
        id: 'account-3',
        isPrimary: true,
      },
      orderBy: undefined,
      select: { id: true, channel: true, externalAccountId: true, vendorId: true },
    });
  });

  it('resolves an active primary account even when its stored identities are blank', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'primary-wing',
          channel: 'coupang',
          externalAccountId: '  ',
          vendorId: null,
        }),
      },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.resolveActiveProvider(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      channel: 'coupang',
      primaryOnly: true,
    })).resolves.toEqual({
      id: 'primary-wing',
      channel: 'coupang',
      externalAccountId: '  ',
      vendorId: null,
    });
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', channel: 'coupang', status: 'active', isPrimary: true },
      select: { id: true, channel: true, externalAccountId: true, vendorId: true },
    }));
  });

  it('claims an empty Rocket identity with an organization, account, channel, status, and value fence', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ vendorId: null, externalAccountId: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      masterProductAbcFormulaState: { upsert: vi.fn().mockResolvedValue({ mappingGeneration: 2n }) },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.claimProviderIdentity(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      accountId: 'rocket-1',
      channel: 'rocket',
      expectedVendorId: null,
      vendorId: ' vendor-1 ',
    })).resolves.toBeUndefined();
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'rocket-1', organizationId: 'org-1', channel: 'rocket', status: 'active' },
      select: { vendorId: true, externalAccountId: true },
    });
    expect(tx.channelAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'rocket-1',
        organizationId: 'org-1',
        channel: 'rocket',
        status: 'active',
        vendorId: null,
      },
      data: { vendorId: 'vendor-1' },
    });
    // 매핑 세대는 채널과 무관하다 — 로켓 계정의 식별이 생겨도 쿠팡과 같이 한 번 올린다.
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.masterProductAbcFormulaState.upsert).toHaveBeenCalledOnce();
  });

  it('allows only exact idempotent claims when a provider identity already exists', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ vendorId: ' vendor-1 ', externalAccountId: 'vendor-1' }),
        updateMany: vi.fn(),
      },
      masterProductAbcFormulaState: { upsert: vi.fn() },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));
    const handle = ownerTransaction(tx as never);

    await expect(persistence.claimProviderIdentity(handle, {
      organizationId: 'org-1', accountId: 'rocket-1', channel: 'rocket',
      expectedVendorId: 'stale-value', vendorId: 'vendor-1',
    })).resolves.toBeUndefined();
    await expect(persistence.claimProviderIdentity(handle, {
      organizationId: 'org-1', accountId: 'rocket-1', channel: 'rocket',
      expectedVendorId: 'vendor-1', vendorId: 'vendor-2',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.channelAccount.updateMany).not.toHaveBeenCalled();
  });

  it('advances product mapping generation after a successful identity claim', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ vendorId: null, externalAccountId: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      masterProductAbcFormulaState: { upsert: vi.fn().mockResolvedValue({ mappingGeneration: 2n }) },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await persistence.claimProviderIdentity(ownerTransaction(tx as never), {
      organizationId: 'org-1', accountId: 'wing-1', channel: 'coupang',
      expectedVendorId: null, vendorId: 'vendor-1',
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.masterProductAbcFormulaState.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      create: { organizationId: 'org-1', mappingGeneration: 1n },
      update: { mappingGeneration: { increment: 1 } },
      select: { mappingGeneration: true },
    });
  });

  it('maps own and shared mall rows without filtering a paused shared identity', async () => {
    const tx = {
      channelAccount: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'rocket-primary', channel: 'rocket', externalAccountId: 'vendor-1' },
          { id: 'rocket-secondary', channel: 'rocket', externalAccountId: 'vendor-2' },
          { id: 'wrong-onch', channel: 'onch', externalAccountId: 'not-onch' },
          { id: 'onch-row', channel: 'onch', externalAccountId: 'onch' },
        ]),
      },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await expect(persistence.resolveMallIdentities(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      mallKeys: ['coupang-direct', 'onch'],
    })).resolves.toEqual([
      { mallKey: 'onch', accountId: 'onch-row' },
      { mallKey: 'coupang-direct', accountId: 'rocket-primary' },
    ]);
    expect(tx.channelAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1' }),
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, channel: true, externalAccountId: true },
    }));
  });

  it('asserts a frozen active provider identity inside the supplied organization', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-1',
          vendorId: 'vendor-1',
          externalAccountId: 'legacy-vendor-1',
        }),
      },
    };
    const persistence = new ChannelAccountPersistenceAdapter({} as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));
    const input = {
      organizationId: 'org-1',
      accountId: 'account-1',
      channel: 'coupang',
      expectedVendorId: 'vendor-1',
    };

    await expect(persistence.assertProviderIdentity(ownerTransaction(tx as never), input)).resolves.toBeUndefined();
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', organizationId: 'org-1', channel: 'coupang', status: 'active' },
      select: { id: true, externalAccountId: true, vendorId: true },
    });

    tx.channelAccount.findFirst.mockResolvedValue(null);
    await expect(persistence.assertProviderIdentity(ownerTransaction(tx as never), input))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
