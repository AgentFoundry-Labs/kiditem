import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../../apps/server/src/sourcing/domain/supplier-source-url-policy';
import { canonicalSourcingCandidateIdentity } from '../../apps/server/src/sourcing/domain/sourcing-candidate-identity';

const repoRoot = resolve(__dirname, '..', '..');
const seedPath = resolve(repoRoot, 'scripts', 'seed-agent-os-browser-qa.ts');

async function loadSeed(): Promise<Record<string, any> | undefined> {
  expect(existsSync(seedPath), 'the reusable browser-QA seed command must exist').toBe(true);
  if (!existsSync(seedPath)) return undefined;
  return import(/* @vite-ignore */ pathToFileURL(seedPath).href);
}

function isolatedTarget(seed: Record<string, any>) {
  const databaseName = `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`;
  return {
    databaseUrl: `postgresql://qa_agent_os@127.0.0.1:55432/${databaseName}`,
    seedTarget: JSON.stringify({
      databaseName,
      host: '127.0.0.1',
      mappedPort: 55432,
    }),
  };
}

function interactiveInput() {
  const input = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    pause: () => void;
    resume: () => void;
    setRawMode: ReturnType<typeof vi.fn>;
  };
  input.isTTY = true;
  input.pause = vi.fn();
  input.resume = vi.fn();
  input.setRawMode = vi.fn();
  return input;
}

describe('isolated Agent OS browser-QA seed', () => {
  it('accepts only the clean-cutover injected Testcontainer target', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const target = isolatedTarget(seed);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget(target)).not.toThrow();
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      seedTarget: undefined,
    })).toThrow(/isolated clean-cutover target/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      databaseUrl: 'postgresql://qa_agent_os@127.0.0.1:55432/kiditem',
      seedTarget: JSON.stringify({
        databaseName: 'kiditem',
        host: '127.0.0.1',
        mappedPort: 55432,
      }),
    })).toThrow(/default development database/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      databaseUrl: `postgresql://qa_agent_os@kiditem-office:55432/${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
      seedTarget: JSON.stringify({
        databaseName: `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
        host: 'kiditem-office',
        mappedPort: 55432,
      }),
    })).toThrow(/Office/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      seedTarget: JSON.stringify({
        databaseName: `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
        host: '127.0.0.1',
        mappedPort: 5432,
      }),
    })).toThrow(/port/i);
  });

  it('allows an email and explicit reset argument but rejects password arguments', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    expect(seed.parseBrowserQaSeedArgs(['--email', ' Browser.QA@example.test '])).toEqual({
      email: 'browser.qa@example.test',
      reset: false,
    });
    expect(seed.parseBrowserQaSeedArgs(['--reset', '--email=Browser.QA@example.test'])).toEqual({
      email: 'browser.qa@example.test',
      reset: true,
    });
    expect(() => seed.parseBrowserQaSeedArgs([], {})).toThrow(/email/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--password'])).toThrow(/password.*stdin/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--reset', '--reset'])).toThrow(/only once/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--unknown'])).toThrow(/unsupported/i);
  });

  it('requires an interactive stdin password and never writes the entered value', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const input = interactiveInput();
    const writes: string[] = [];
    const output = { write: (value: string) => writes.push(value) };
    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const read = seed.readBrowserQaPassword(input, output);
    input.emit('data', Buffer.from(`${enteredValue}\r`, 'utf8'));

    await expect(read).resolves.toBe(enteredValue);
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(writes.join('')).not.toContain(enteredValue);
    await expect(seed.readBrowserQaPassword({ isTTY: false }, output)).rejects.toThrow(/interactive stdin/i);
  });

  it('builds deterministic public high-risk and foreign-org isolation fixtures', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const passwordHash = `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
    const now = new Date('2026-08-27T00:00:00.000Z');
    const plan = seed.createBrowserQaSeedPlan({
      email: 'browser.qa@example.test',
      passwordHash,
      now,
    });

    expect(plan).toMatchObject({
      organization: { isActive: true },
      user: {
        email: 'browser.qa@example.test',
        passwordHash,
        isActive: true,
      },
      membership: { role: 'owner', status: 'active' },
      sourcingCandidate: { isDeleted: false },
      sellpiaInventorySku: { isActive: true },
      sellpiaInventoryState: {
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: now,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      },
      purchaseOrder: {
        status: 'draft',
        externalOrderPlatform: null,
        externalOrderId: null,
        externalOrderUrl: null,
      },
      purchaseOrderItem: {},
      foreignOrganization: { isActive: false },
      foreignSourcingCandidate: { isDeleted: false },
      foreignPurchaseOrder: {
        status: 'draft',
        externalOrderId: null,
      },
    });
    expect(Object.keys(plan)).toEqual([
      'organization',
      'user',
      'membership',
      'sourcingCandidate',
      'sellpiaInventorySku',
      'sellpiaInventoryState',
      'purchaseOrder',
      'purchaseOrderItem',
      'foreignOrganization',
      'foreignSourcingCandidate',
      'foreignPurchaseOrder',
    ]);
    expect(plan).not.toHaveProperty('foreignMembership');
  });

  it('builds its synthetic candidate through the Sourcing allowlist and canonical identity policy', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const plan = seed.createBrowserQaSeedPlan({
      email: 'browser.qa@example.test',
      passwordHash: `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`,
    });
    const supplier = parseAllowedSupplierUrl(plan.sourcingCandidate.sourceUrl);
    const offerId = extractSupplierOfferId(supplier);

    expect(supplier.platform).toBe('1688');
    expect(plan.sourcingCandidate.sourceUrl).toBe(supplier.normalizedUrl);
    expect(plan.sourcingCandidate.sourcePlatform).toBe('ALIBABA_1688');
    expect(plan.sourcingCandidate.externalOfferId).toBe(offerId);
    expect(plan.sourcingCandidate.sourceIdentityHash).toBe(canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: supplier.normalizedUrl,
      validatedExternalOfferId: offerId,
      variantKeyNormalized: plan.sourcingCandidate.variantKeyNormalized,
    }));
  });

  it('seeds public high-risk prerequisites and foreign decoys without persisting raw credentials', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const hashPassword = vi.fn(async () => `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`);
    const organizationUpsert = vi.fn(async ({ where }: { where: { slug: string } }) => ({
      id: where.slug === 'browser-qa-agent-os' ? 'organization-id' : 'foreign-organization-id',
    }));
    const userUpsert = vi.fn().mockResolvedValue({ id: 'user-id' });
    const membershipUpsert = vi.fn().mockResolvedValue({ id: 'membership-id' });
    const candidateFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'candidate-id' })
      .mockResolvedValueOnce({ id: 'foreign-candidate-id' });
    const candidateCreate = vi.fn(async ({ data }: { data: { organizationId: string } }) => ({
      id: data.organizationId === 'organization-id' ? 'candidate-id' : 'foreign-candidate-id',
    }));
    const sellpiaInventorySkuUpsert = vi.fn().mockResolvedValue({ id: 'inventory-sku-id' });
    const sellpiaInventoryStateUpsert = vi.fn().mockResolvedValue({ organizationId: 'organization-id' });
    const purchaseOrderFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'purchase-order-id' })
      .mockResolvedValueOnce({ id: 'foreign-purchase-order-id' });
    const purchaseOrderCreate = vi.fn(async ({ data }: { data: { organizationId: string } }) => ({
      id: data.organizationId === 'organization-id'
        ? 'purchase-order-id'
        : 'foreign-purchase-order-id',
    }));
    const purchaseOrderUpdate = vi.fn(async ({
      where,
    }: {
      where: { id_organizationId: { organizationId: string } };
    }) => ({
      id: where.id_organizationId.organizationId === 'organization-id'
        ? 'purchase-order-id'
        : 'foreign-purchase-order-id',
    }));
    const purchaseOrderUpsert = vi.fn(async ({
      where,
    }: {
      where: { organizationId_idempotencyKey: { organizationId: string } };
    }) => ({
      id: where.organizationId_idempotencyKey.organizationId === 'organization-id'
        ? 'purchase-order-id'
        : 'foreign-purchase-order-id',
    }));
    const purchaseOrderItemFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'purchase-order-item-id' });
    const purchaseOrderItemCreate = vi.fn().mockResolvedValue({ id: 'purchase-order-item-id' });
    const transaction = {
      organization: { upsert: organizationUpsert },
      user: { upsert: userUpsert },
      organizationMembership: { upsert: membershipUpsert },
      sourcingCandidate: { findFirst: candidateFindFirst, create: candidateCreate },
      sellpiaInventorySku: { upsert: sellpiaInventorySkuUpsert },
      sellpiaInventoryState: { upsert: sellpiaInventoryStateUpsert },
      purchaseOrder: {
        findFirst: purchaseOrderFindFirst,
        create: purchaseOrderCreate,
        update: purchaseOrderUpdate,
        upsert: purchaseOrderUpsert,
      },
      purchaseOrderItem: {
        findFirst: purchaseOrderItemFindFirst,
        create: purchaseOrderItemCreate,
      },
    };
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
    };

    const result = await seed.runBrowserQaSeed({
      prisma,
      email: 'browser.qa@example.test',
      password: enteredValue,
      hashPassword,
    });
    const replay = await seed.runBrowserQaSeed({
      prisma,
      email: 'browser.qa@example.test',
      password: enteredValue,
      hashPassword,
    });

    expect(hashPassword).toHaveBeenCalledWith(enteredValue);
    expect(userUpsert.mock.calls[0]?.[0].create).toMatchObject({
      passwordHash: expect.stringMatching(/^scrypt\$16384\$/),
    });
    expect(sellpiaInventorySkuUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        organizationId: 'organization-id',
        isActive: true,
      },
    });
    expect(sellpiaInventoryStateUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        organizationId: 'organization-id',
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: expect.any(Date),
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      },
    });
    expect(purchaseOrderCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        organizationId: 'organization-id',
        status: 'draft',
        externalOrderId: null,
      },
    });
    expect(purchaseOrderItemCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        organizationId: 'organization-id',
        orderId: 'purchase-order-id',
        sellpiaInventorySkuId: 'inventory-sku-id',
      },
    });
    const foreignCandidate = candidateCreate.mock.calls
      .map(([call]) => call.data)
      .find((data) => data.organizationId === 'foreign-organization-id');
    expect(foreignCandidate).toMatchObject({
      organizationId: 'foreign-organization-id',
      isDeleted: false,
    });
    expect(foreignCandidate).not.toHaveProperty('triggeredByUserId');
    expect(purchaseOrderCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        organizationId: 'foreign-organization-id',
        status: 'draft',
      },
    });
    expect(result).toMatchObject({
      sellpiaInventorySkuId: 'inventory-sku-id',
      purchaseOrderId: 'purchase-order-id',
      purchaseOrderItemId: 'purchase-order-item-id',
      foreignOrganizationId: 'foreign-organization-id',
      foreignSourcingCandidateId: 'foreign-candidate-id',
      foreignPurchaseOrderId: 'foreign-purchase-order-id',
    });
    expect(replay).toMatchObject({
      purchaseOrderId: 'purchase-order-id',
      foreignPurchaseOrderId: 'foreign-purchase-order-id',
    });
    expect(purchaseOrderUpsert).not.toHaveBeenCalled();
    expect(purchaseOrderFindFirst).toHaveBeenCalledTimes(4);
    expect(purchaseOrderCreate).toHaveBeenCalledTimes(2);
    expect(purchaseOrderUpdate).toHaveBeenCalledTimes(2);
    expect(purchaseOrderUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id_organizationId: {
          id: 'purchase-order-id',
          organizationId: 'organization-id',
        },
      },
      data: {
        status: 'draft',
        externalOrderId: null,
      },
    });
    expect(purchaseOrderUpdate.mock.calls[1]?.[0]).toMatchObject({
      where: {
        id_organizationId: {
          id: 'foreign-purchase-order-id',
          organizationId: 'foreign-organization-id',
        },
      },
      data: {
        status: 'draft',
        externalOrderId: null,
      },
    });
    expect(JSON.stringify({
      result,
      replay,
      userCalls: userUpsert.mock.calls,
      candidateCalls: candidateCreate.mock.calls,
      inventoryCalls: sellpiaInventorySkuUpsert.mock.calls,
      purchaseOrderCreates: purchaseOrderCreate.mock.calls,
      purchaseOrderUpdates: purchaseOrderUpdate.mock.calls,
    })).not.toContain(enteredValue);
    expect(membershipUpsert).toHaveBeenCalledTimes(2);
    expect(membershipUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        organizationId: 'organization-id',
        userId: 'user-id',
      },
    });
    expect(candidateFindFirst).toHaveBeenCalledTimes(4);
    expect(candidateCreate).toHaveBeenCalledTimes(2);
  });

  it('guards reset to the validated Testcontainer target before executing a destructive statement', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const executeRaw = vi.fn().mockResolvedValue(0);
    const target = seed.assertIsolatedBrowserQaSeedTarget(isolatedTarget(seed));

    await expect(seed.resetBrowserQaDatabase({
      prisma: { $executeRaw: executeRaw },
      target,
    })).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledOnce();

    await expect(seed.resetBrowserQaDatabase({
      prisma: { $executeRaw: executeRaw },
      target: {
        ...target,
        databaseUrl: 'postgresql://qa_agent_os@127.0.0.1:55432/kiditem',
        databaseName: 'kiditem',
      },
    })).rejects.toThrow(/default development database/i);
    expect(executeRaw).toHaveBeenCalledOnce();
  });

  it('runs guarded reset before reseeding and reports only safe fixture IDs', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const target = isolatedTarget(seed);
    const input = interactiveInput();
    const promptWrites: string[] = [];
    const resultWrites: string[] = [];
    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const events: string[] = [];
    const prisma = {
      $disconnect: vi.fn(async () => {
        events.push('disconnect');
      }),
    };
    const seeded = {
      organizationId: 'organization-id',
      userId: 'user-id',
      membershipId: 'membership-id',
      sourcingCandidateId: 'candidate-id',
      sellpiaInventorySkuId: 'inventory-sku-id',
      purchaseOrderId: 'purchase-order-id',
      purchaseOrderItemId: 'purchase-order-item-id',
      foreignOrganizationId: 'foreign-organization-id',
      foreignSourcingCandidateId: 'foreign-candidate-id',
      foreignPurchaseOrderId: 'foreign-purchase-order-id',
    };
    const createPrisma = vi.fn(() => prisma);
    const resetDatabase = vi.fn(async () => {
      events.push('reset');
    });
    const runSeed = vi.fn(async () => {
      events.push('seed');
      return seeded;
    });

    const seededResult = seed.main({
      argv: ['--reset', '--email', 'browser.qa@example.test'],
      environment: {
        DATABASE_URL: target.databaseUrl,
        [seed.BROWSER_QA_SEED_TARGET_ENV]: target.seedTarget,
      },
      input,
      output: { write: (value: string) => promptWrites.push(value) },
      resultOutput: { write: (value: string) => resultWrites.push(value) },
      createPrisma,
      resetDatabase,
      runSeed,
    });
    input.emit('data', Buffer.from(`${enteredValue}\r`, 'utf8'));

    await expect(seededResult).resolves.toEqual(seeded);
    expect(createPrisma).toHaveBeenCalledWith(target.databaseUrl);
    expect(resetDatabase).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      target: expect.objectContaining({
        databaseName: expect.stringContaining(seed.GENERATED_DATABASE_MARKER),
      }),
    }));
    expect(runSeed).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      email: 'browser.qa@example.test',
      password: enteredValue,
    }));
    expect(events).toEqual(['reset', 'seed', 'disconnect']);
    expect(resultWrites.join('')).toContain('"purchaseOrderId":"purchase-order-id"');
    expect(JSON.stringify({ promptWrites, resultWrites, seeded })).not.toContain(enteredValue);
  });

  it('has no password environment input and uses the auth-domain hash implementation', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const source = readFileSync(seedPath, 'utf8');
    expect(source).toContain('hashAuthPassword');
    expect(source).not.toContain('KIDITEM_BROWSER_QA_PASSWORD');
    expect(source).not.toContain('process.env.PASSWORD');
  });

  it('fails a standalone invocation before prompting or connecting when clean-cutover context is absent', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const input = interactiveInput();
    const output = { write: vi.fn() };
    const target = isolatedTarget(seed);

    await expect(seed.main({
      argv: ['--email', 'browser.qa@example.test'],
      environment: { DATABASE_URL: target.databaseUrl },
      input,
      output,
    })).rejects.toThrow(/isolated clean-cutover target context/i);
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(output.write).not.toHaveBeenCalled();
  });
});
