import { describe, expect, it, vi } from 'vitest';
import { RegistrationStateService } from '../registration-state.service';
import type {
  RegistrationStateAccountFacts,
  RegistrationStatePersistencePort,
  RegistrationStateProductFacts,
} from '../../../port/out/persistence/registration-state.persistence.port';
import type { ChannelRegistrableContentFactsPort } from '../../../port/out/content/registrable-content-facts.port';

const PRODUCT = '00000000-0000-4000-8000-000000000001';
const ACCOUNT = '00000000-0000-4000-8000-0000000000a1';
const CATALOG_ACCOUNT = '00000000-0000-4000-8000-0000000000a2';
const TARGET = '00000000-0000-4000-8000-0000000000b1';
const LISTING = '00000000-0000-4000-8000-0000000000c1';
const CATALOG_LISTING = '00000000-0000-4000-8000-0000000000c2';
const EXECUTION = '00000000-0000-4000-8000-0000000000d1';
const REV_CURRENT = '00000000-0000-4000-8000-0000000000e1';
const REV_SELECTED = '00000000-0000-4000-8000-0000000000e2';
const ASSET_CURRENT = '00000000-0000-4000-8000-0000000000f1';
const ASSET_NEW = '00000000-0000-4000-8000-0000000000f2';

function registeredAccount(overrides: Partial<RegistrationStateAccountFacts> = {}): RegistrationStateAccountFacts {
  return {
    channelAccountId: ACCOUNT,
    channel: 'mall-a',
    channelAccountName: '몰 A',
    target: { id: TARGET, version: 2, selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null },
    listing: { id: LISTING, externalId: '4270', status: '승인완료' },
    latestListingShaping: {
      id: EXECUTION,
      kind: 'register',
      status: 'succeeded',
      providerOutcome: 'succeeded',
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      completedAt: new Date('2026-09-24T00:01:00.000Z'),
    },
    lastSucceededFrozen: { targetVersion: 2, productVersion: 3, detailPageRevisionId: REV_CURRENT, representativeImageAssetId: ASSET_CURRENT },
    latestAvailability: null,
    ...overrides,
  };
}

function setup(accounts: RegistrationStateAccountFacts[], content: { revisionId?: string | null; assetId?: string | null } = {}) {
  const product: RegistrationStateProductFacts = { salesProductId: PRODUCT, productVersion: 3, accounts };
  const persistence: RegistrationStatePersistencePort = {
    readFacts: vi.fn(async (_organizationId: string, ids: readonly string[]) =>
      new Map(ids.includes(PRODUCT) ? [[PRODUCT, product]] : [])),
  };
  const readCurrentContentIds = vi.fn(async () => new Map([[PRODUCT, {
    detailPageRevisionId: content.revisionId === undefined ? REV_CURRENT : content.revisionId,
    thumbnailAssetId: content.assetId === undefined ? ASSET_CURRENT : content.assetId,
  }]]));
  const contentFacts: ChannelRegistrableContentFactsPort = { readCurrentContentIds };
  return { service: new RegistrationStateService(persistence, contentFacts), readCurrentContentIds };
}

describe('registration state service', () => {
  it('reads a registered account unchanged when the frozen content is still the current one', async () => {
    const { service, readCurrentContentIds } = setup([registeredAccount()]);

    const view = (await service.readForSalesProducts('org', [PRODUCT])).get(PRODUCT)!;

    expect(view.accounts).toEqual([{
      channelAccountId: ACCOUNT,
      channel: 'mall-a',
      channelAccountName: '몰 A',
      registrationTargetId: TARGET,
      channelListingId: LISTING,
      externalListingId: '4270',
      state: 'registered',
      soldOut: false,
      changedSinceRegistration: false,
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      lastExecution: {
        id: EXECUTION,
        kind: 'register',
        status: 'succeeded',
        providerOutcome: 'succeeded',
        createdAt: '2026-09-24T00:00:00.000Z',
        completedAt: '2026-09-24T00:01:00.000Z',
      },
    }]);
    // 작업공간의 현재 상세 revision · 대표이미지 자산 id 를 한 번에 읽는다.
    expect(readCurrentContentIds).toHaveBeenCalledTimes(1);
    expect(readCurrentContentIds).toHaveBeenCalledWith({ organizationId: 'org', salesProductIds: [PRODUCT] });
  });

  it('marks re-send needed when the workspace representative image moved on', async () => {
    const { service } = setup([registeredAccount()], { assetId: ASSET_NEW });
    const [account] = (await service.readForSalesProducts('org', [PRODUCT])).get(PRODUCT)!.accounts;
    expect(account.changedSinceRegistration).toBe(true);
  });

  it('compares with the target\'s own selections before the workspace current ones', async () => {
    const selected = registeredAccount({
      target: { id: TARGET, version: 2, selectedThumbnailAssetId: ASSET_CURRENT, selectedDetailPageRevisionId: REV_SELECTED },
    });
    const { service } = setup([selected], { assetId: ASSET_NEW });
    const [account] = (await service.readForSalesProducts('org', [PRODUCT])).get(PRODUCT)!.accounts;
    // 대표이미지는 대상이 고른 자산이 얼린 값과 같고, 상세는 대상이 고른 다른 revision 이라 재전송이 필요하다.
    expect(account).toMatchObject({ selectedDetailPageRevisionId: REV_SELECTED, changedSinceRegistration: true });

    const sameSelection = registeredAccount({
      target: { id: TARGET, version: 2, selectedThumbnailAssetId: ASSET_CURRENT, selectedDetailPageRevisionId: REV_CURRENT },
    });
    const unchanged = setup([sameSelection], { assetId: ASSET_NEW, revisionId: REV_SELECTED });
    const [kept] = (await unchanged.service.readForSalesProducts('org', [PRODUCT])).get(PRODUCT)!.accounts;
    expect(kept.changedSinceRegistration).toBe(false);
  });

  it('reads a catalog-only listing as registered with no target, sold out when the mall discontinued it', async () => {
    const { service } = setup([{
      channelAccountId: CATALOG_ACCOUNT,
      channel: 'mall-b',
      channelAccountName: null,
      target: null,
      listing: { id: CATALOG_LISTING, externalId: 'B-1', status: '단종' },
      latestListingShaping: null,
      lastSucceededFrozen: null,
      latestAvailability: null,
    }], { revisionId: null, assetId: null });

    const [account] = (await service.readForSalesProducts('org', [PRODUCT])).get(PRODUCT)!.accounts;

    expect(account).toMatchObject({
      registrationTargetId: null,
      channelListingId: CATALOG_LISTING,
      externalListingId: 'B-1',
      state: 'registered',
      soldOut: true,
      changedSinceRegistration: false,
      lastExecution: null,
    });
  });

  it('asks Content nothing when no product was found', async () => {
    const { service, readCurrentContentIds } = setup([]);
    expect((await service.readForSalesProducts('org', ['00000000-0000-4000-8000-00000000ffff'])).size).toBe(0);
    expect(readCurrentContentIds).not.toHaveBeenCalled();
  });
});
