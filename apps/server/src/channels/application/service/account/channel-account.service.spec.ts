import { describe, expect, it, vi } from 'vitest';
import type { MallAccountRecord, MallAccountWrite } from '../../port/out/persistence/channel-account.persistence.port';
import { ChannelAccountService } from './channel-account.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIXED_NOW = new Date('2026-09-01T00:00:00.000Z');

describe('ChannelAccountService', () => {
  it('lists catalog malls by saved order and exposes account IDs without exposing credentials', async () => {
    const fixture = makeService([
      mallRow('gs-shop', {
        orderCollection: {
          loginId: 'shop-id',
          password: encrypted('do-not-return'),
          sortOrder: 0,
        },
      }),
      mallRow('onch', { orderCollection: { sortOrder: 1 } }),
    ]);

    const accounts = await fixture.service.list(ORGANIZATION_ID);

    expect(accounts.slice(0, 3).map((account) => account.key)).toEqual([
      'gs-shop',
      'onch',
      'one-polaris',
    ]);
    expect(accounts[0]).toMatchObject({
      channelAccountId: 'row-gs-shop',
      configured: true,
      loginId: 'shop-id',
      hasPassword: true,
    });
    expect(JSON.stringify(accounts)).not.toContain('do-not-return');
  });

  it('creates one own mall row, trims fields, merges config, and encrypts the password', async () => {
    const fixture = makeService([]);

    const saved = await fixture.service.update(ORGANIZATION_ID, 'onch', {
      loginId: ' merchant-id ',
      password: ' secret ',
      siteUrl: ' https://shop.example.com ',
      memo: ' note ',
    });

    expect(saved).toMatchObject({
      key: 'onch',
      channelAccountId: 'row-onch',
      configured: true,
      loginId: 'merchant-id',
      siteUrl: 'https://shop.example.com',
      memo: 'note',
      passwordUpdatedAt: FIXED_NOW.toISOString(),
    });
    const row = fixture.rows()[0]!;
    expect(row).toMatchObject({
      channel: 'onch',
      externalAccountId: 'onch',
      name: '온채널',
      status: 'configured',
    });
    expect(row.config).toMatchObject({ orderCollection: { password: encrypted('secret') } });
    expect(await fixture.service.getPassword(ORGANIZATION_ID, 'onch')).toEqual({
      key: 'onch',
      loginId: 'merchant-id',
      supplierLoginId: null,
      password: 'secret',
    });
  });

  it('preserves a stored credential envelope and display order when password input is blank', async () => {
    const password = encrypted('same-secret');
    const fixture = makeService([
      mallRow('onch', {
        rootSetting: 'keep-root',
        orderCollection: {
          password,
          passwordUpdatedAt: '2026-08-01T00:00:00.000Z',
          sortOrder: 3,
          integrationNote: 'keep-nested',
        },
      }),
    ]);

    const updated = await fixture.service.update(ORGANIZATION_ID, 'onch', {
      loginId: 'new-id',
      password: '  ',
    });

    const row = fixture.rows()[0]!;
    expect(row.config).toMatchObject({
      rootSetting: 'keep-root',
      orderCollection: {
        password,
        passwordUpdatedAt: '2026-08-01T00:00:00.000Z',
        sortOrder: 3,
        integrationNote: 'keep-nested',
      },
    });
    expect(updated.hasPassword).toBe(true);
    expect(await fixture.service.getPassword(ORGANIZATION_ID, 'onch')).toEqual({
      key: 'onch',
      loginId: 'new-id',
      supplierLoginId: null,
      password: 'same-secret',
    });
  });

  it('reorders only existing rows, clears omitted sort orders, and preserves other configuration', async () => {
    const fixture = makeService([
      mallRow('onch', { rootSetting: 'onch-root', orderCollection: { sortOrder: 4 } }),
      mallRow('art09', { rootSetting: 'art-root', orderCollection: { sortOrder: 7 } }),
    ]);

    await fixture.service.reorder(ORGANIZATION_ID, ['onch']);

    expect(fixture.rows()).toHaveLength(2);
    expect(fixture.rows()[0]?.config).toMatchObject({
      rootSetting: 'onch-root',
      orderCollection: { sortOrder: 0 },
    });
    expect(fixture.rows()[1]?.config).toMatchObject({
      rootSetting: 'art-root',
      orderCollection: { sortOrder: null },
    });
  });

  it('requires the existing Rocket row for Coupang direct and preserves its paused status', async () => {
    const missing = makeService([]);
    await expect(missing.service.update(ORGANIZATION_ID, 'coupang-direct', {
      loginId: 'supplier-id',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'SHARED_CHANNEL_ACCOUNT_MISSING' }, message: expect.stringContaining('채널 계정을 먼저 연결하세요') });
    expect(missing.rows()).toHaveLength(0);

    const fixture = makeService([
      {
        id: 'rocket-row',
        channel: 'rocket',
        externalAccountId: 'vendor-1',
        name: 'Rocket paused by user',
        status: 'paused',
        config: { rootSetting: 'keep' },
        updatedAt: FIXED_NOW,
      },
    ]);
    const updated = await fixture.service.update(ORGANIZATION_ID, 'coupang-direct', {
      loginId: 'supplier-id',
      password: 'supplier-secret',
    });

    expect(updated.channelAccountId).toBe('rocket-row');
    expect(fixture.rows()[0]).toMatchObject({
      name: 'Rocket paused by user',
      status: 'paused',
      config: { rootSetting: 'keep', orderCollection: { loginId: 'supplier-id' } },
    });
  });

  it('requires both Art09 login IDs before marking its account configured', async () => {
    const fixture = makeService([]);
    const incomplete = await fixture.service.update(ORGANIZATION_ID, 'art09', {
      loginId: 'shop-id',
      password: 'secret',
    });
    expect(incomplete.configured).toBe(false);
    const complete = await fixture.service.update(ORGANIZATION_ID, 'art09', {
      loginId: 'shop-id',
      supplierLoginId: 'supplier-id',
      password: 'secret',
    });
    expect(complete).toMatchObject({ configured: true, loginId: 'shop-id', supplierLoginId: 'supplier-id' });
  });

  describe('updateListingProfile (KID-235)', () => {
    it('refuses an input outside the listing profile document as invalid and writes nothing', async () => {
      const fixture = makeService([mallRow('onch', { orderCollection: { loginId: 'keep' } })]);

      await expect(fixture.service.updateListingProfile(ORGANIZATION_ID, 'onch', { loginId: 'x' }))
        .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
      await expect(fixture.service.updateListingProfile(ORGANIZATION_ID, 'onch', { shipping: 'text' }))
        .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
      expect(fixture.rows()[0]?.config).toEqual({ orderCollection: { loginId: 'keep' } });
    });

    it('refuses a mall without an account row as not_found instead of creating one', async () => {
      const fixture = makeService([]);

      await expect(fixture.service.updateListingProfile(ORGANIZATION_ID, 'onch', { categoryCode: '12' }))
        .rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND', kind: 'not_found' });
      expect(fixture.rows()).toHaveLength(0);
    });

    it('changes only the given fields and keeps orderCollection and the fields it did not send', async () => {
      const password = encrypted('keep-secret');
      const fixture = makeService([
        mallRow('onch', {
          rootSetting: 'keep-root',
          orderCollection: { loginId: 'merchant', password, sortOrder: 2 },
          listingProfile: { categoryCode: '12', releaseAddress: { summary: '서울 물류센터' }, namePrefix: '[키드]' },
        }),
      ]);

      const saved = await fixture.service.updateListingProfile(ORGANIZATION_ID, 'onch', {
        shipping: { summary: '기본 3,000원' },
        namePrefix: '',
      });

      expect(saved.listingProfile).toEqual({
        shipping: { summary: '기본 3,000원' },
        returnPolicy: null,
        releaseAddress: { summary: '서울 물류센터' },
        returnAddress: null,
        asPhone: null,
        categoryCode: '12',
        namePrefix: null,
        nameSuffix: null,
      });
      expect(saved).toMatchObject({ loginId: 'merchant', hasPassword: true, sortOrder: 2 });
      expect(fixture.rows()[0]?.config).toMatchObject({
        rootSetting: 'keep-root',
        orderCollection: { loginId: 'merchant', password, sortOrder: 2 },
      });
    });
  });

  it('answers a missing credential encryption key as an internal error, not as operator input', async () => {
    const fixture = makeService([]);
    const cryptoError = Object.assign(new Error('KIDITEM_CREDENTIAL_KEY missing'), { name: 'CoupangCredentialCryptoError' });
    const persistence = (fixture.service as unknown as { persistence: unknown }).persistence;
    const service = new ChannelAccountService(persistence as never, {
      isEncrypted: () => false,
      encrypt: () => { throw cryptoError; },
      decrypt: () => '',
    } as never, () => FIXED_NOW);
    await expect(service.update(ORGANIZATION_ID, 'onch', { loginId: 'id', password: 'secret' }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR', details: { reason: 'CREDENTIAL_KEY_MISSING' } });
  });

  it('keeps the Wing login on the primary Wing account row in the same orderCollection shape, outside the mall list (KID-377)', async () => {
    const primary = wingRow('row-wing-primary', { rootSetting: 'keep-root', orderCollection: { loginId: 'wing-id', password: encrypted('wing-secret') } });
    const fixture = makeService([primary, wingRow('row-wing-second', { orderCollection: { loginId: 'other-id', password: encrypted('other-secret') } })]);

    expect(await fixture.service.getPassword(ORGANIZATION_ID, 'coupang')).toEqual({
      key: 'coupang',
      loginId: 'wing-id',
      supplierLoginId: null,
      password: 'wing-secret',
    });

    const saved = await fixture.service.update(ORGANIZATION_ID, 'coupang', { loginId: ' new-wing-id ', password: ' new-wing-secret ' });
    expect(saved).toMatchObject({ key: 'coupang', channelAccountId: 'row-wing-primary', loginId: 'new-wing-id', hasPassword: true });
    const row = fixture.rows().find((candidate) => candidate.id === 'row-wing-primary')!;
    expect(row).toMatchObject({ channel: 'coupang', name: 'Coupang Wing', status: 'active' });
    expect(row.config).toMatchObject({ rootSetting: 'keep-root', orderCollection: { loginId: 'new-wing-id', password: encrypted('new-wing-secret') } });
    expect(fixture.rows().find((candidate) => candidate.id === 'row-wing-second')!.config)
      .toEqual({ orderCollection: { loginId: 'other-id', password: encrypted('other-secret') } });

    // 주문 수집 몰 목록·순서에는 들어가지 않는다(주문 수집 화면이 윙을 몰로 돌리지 않게).
    expect((await fixture.service.list(ORGANIZATION_ID)).map((account) => account.key)).not.toContain('coupang');
    await expect(fixture.service.reorder(ORGANIZATION_ID, ['coupang'])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('never creates a Wing account row for a login save — the Wing account is connected first', async () => {
    const fixture = makeService([]);
    await expect(fixture.service.update(ORGANIZATION_ID, 'coupang', { loginId: 'wing-id', password: 'wing-secret' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'SHARED_CHANNEL_ACCOUNT_MISSING' } });
    expect(fixture.rows()).toEqual([]);
    expect(await fixture.service.getPassword(ORGANIZATION_ID, 'coupang')).toEqual({ key: 'coupang', loginId: null, supplierLoginId: null, password: null });
  });

  it('rejects unknown malls and duplicate order keys through the public exception contract', async () => {
    const fixture = makeService([]);
    await expect(fixture.service.update(ORGANIZATION_ID, 'unknown', {}))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
    await expect(fixture.service.reorder(ORGANIZATION_ID, ['onch', 'onch']))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
  });
});

function encrypted(ciphertext: string) {
  return { version: 'test', ciphertext };
}

function makeService(initialRows: MallAccountRecord[]) {
  let records = [...initialRows];
  const persistence = {
    listMallAccounts: vi.fn(async () => records),
    withMallAccounts: vi.fn(async (_organizationId: string, work: (accounts: {
      list(): Promise<MallAccountRecord[]>;
      save(input: MallAccountWrite): Promise<MallAccountRecord>;
    }) => Promise<unknown>) => work({
      list: async () => records,
      save: async (input) => {
        if (input.operation === 'update') {
          const index = records.findIndex((record) => record.id === input.id);
          if (index < 0) throw new Error('missing test row');
          const current = records[index]!;
          const { operation: _operation, id: _id, ...updates } = input;
          records[index] = { ...current, ...updates, updatedAt: FIXED_NOW };
          return records[index]!;
        }
        const saved: MallAccountRecord = {
          id: `row-${input.channel}`,
          channel: input.channel,
          externalAccountId: input.externalAccountId,
          name: input.name,
          status: input.status,
          config: input.config,
          updatedAt: FIXED_NOW,
        };
        records = [...records, saved];
        return saved;
      },
    })),
    getCoupangSettings: vi.fn(),
    upsertCoupangSettings: vi.fn(),
    listActive: vi.fn(),
    ensureRocketAccount: vi.fn(),
    getPrimaryCoupangAccountId: vi.fn(),
    findByIds: vi.fn(),
    resolveActiveProvider: vi.fn(),
    resolveMallIdentities: vi.fn(),
    assertProviderIdentity: vi.fn(),
  };
  const credentials = {
    isEncrypted: (value: unknown): boolean => Boolean(
      value && typeof value === 'object' && (value as { version?: unknown }).version === 'test',
    ),
    encrypt: (value: string) => encrypted(value),
    decrypt: (value: unknown) => String((value as { ciphertext?: unknown }).ciphertext),
  };
  return {
    service: new ChannelAccountService(persistence as never, credentials as never, () => FIXED_NOW),
    rows: () => records,
  };
}

function wingRow(id: string, config: Record<string, unknown>): MallAccountRecord {
  return { id, channel: 'coupang', externalAccountId: 'A00000001', name: 'Coupang Wing', status: 'active', config, updatedAt: FIXED_NOW };
}

function mallRow(key: string, config: Record<string, unknown>): MallAccountRecord {
  return {
    id: `row-${key}`,
    channel: key,
    externalAccountId: key,
    name: key === 'gs-shop' ? 'GS샵' : key,
    status: 'configured',
    config,
    updatedAt: FIXED_NOW,
  };
}
