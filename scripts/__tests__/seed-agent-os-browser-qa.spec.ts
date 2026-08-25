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

  it('allows an email from the explicit non-secret argument but rejects password arguments', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    expect(seed.parseBrowserQaSeedArgs(['--email', ' Browser.QA@example.test '])).toEqual({
      email: 'browser.qa@example.test',
    });
    expect(() => seed.parseBrowserQaSeedArgs([], {})).toThrow(/email/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--password'])).toThrow(/password.*stdin/i);
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

  it('builds only the deterministic active owner and one synthetic Sourcing fixture', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const passwordHash = `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
    const plan = seed.createBrowserQaSeedPlan({
      email: 'browser.qa@example.test',
      passwordHash,
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
    });
    expect(Object.keys(plan)).toEqual([
      'organization',
      'user',
      'membership',
      'sourcingCandidate',
    ]);
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

  it('hashes the stdin value through the auth domain and persists no raw credential', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const hashPassword = vi.fn(async () => `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`);
    const organizationUpsert = vi.fn().mockResolvedValue({ id: 'organization-id' });
    const userUpsert = vi.fn().mockResolvedValue({ id: 'user-id' });
    const membershipUpsert = vi.fn().mockResolvedValue({ id: 'membership-id' });
    const candidateFindFirst = vi.fn().mockResolvedValue(null);
    const candidateCreate = vi.fn().mockResolvedValue({ id: 'candidate-id' });
    const transaction = {
      organization: { upsert: organizationUpsert },
      user: { upsert: userUpsert },
      organizationMembership: { upsert: membershipUpsert },
      sourcingCandidate: { findFirst: candidateFindFirst, create: candidateCreate },
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

    expect(hashPassword).toHaveBeenCalledWith(enteredValue);
    expect(userUpsert.mock.calls[0]?.[0].create).toMatchObject({
      passwordHash: expect.stringMatching(/^scrypt\$16384\$/),
    });
    expect(JSON.stringify({ result, calls: userUpsert.mock.calls })).not.toContain(enteredValue);
    expect(membershipUpsert).toHaveBeenCalledOnce();
    expect(candidateFindFirst).toHaveBeenCalledOnce();
    expect(candidateCreate).toHaveBeenCalledOnce();
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
