import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scannerPath = path.join(repoRoot, 'scripts/check-queryraw-tenancy.sh');

// The scanner derives its repo root from its own location, so a throwaway tree
// holding scripts/ + apps/server/src/ is a complete fixture repository.
function scan(files) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'queryraw-tenancy-'));
  try {
    mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
    copyFileSync(scannerPath, path.join(fixture, 'scripts/check-queryraw-tenancy.sh'));
    for (const [name, source] of Object.entries(files)) {
      const target = path.join(fixture, 'apps/server/src', name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    return spawnSync('bash', ['scripts/check-queryraw-tenancy.sh'], {
      cwd: fixture,
      encoding: 'utf8',
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

const SCOPED_WHERE = 'WHERE organization_id = ${organizationId}::uuid';
const UNSCOPED_WHERE = 'WHERE channel_listing_id = ${channelListingId}::uuid';

// KID-222: `Prisma.sql` argument forms. The scanner used to see only the two
// tagged-template forms, so everything written this way went unchecked.
const CALL_FORMS = {
  'query-raw-call.ts': (where) => `await tx.$queryRaw(Prisma.sql\`
    SELECT id FROM channel_listings ${where}
  \`);`,
  'execute-raw-call.ts': (where) => `await tx.$executeRaw(Prisma.sql\`
    UPDATE channel_listings SET synced_at = now() ${where}
  \`);`,
  'query-raw-unsafe.ts': (where) => `await tx.$queryRawUnsafe(\`
    SELECT id FROM channel_listings ${where}
  \`);`,
  'execute-raw-unsafe.ts': (where) => `await tx.$executeRawUnsafe(\`
    UPDATE channel_listings SET synced_at = now() ${where}
  \`);`,
};

// Tagged-template forms. `$queryRaw` and `$queryRaw<T>` were covered from the
// start; `$executeRaw` is the last form KID-222 brought under the same rule.
const TAGGED_FORMS = {
  'query-raw-tagged.ts': (where) => `await tx.$queryRaw\`
    SELECT id FROM channel_listings ${where}
  \`;`,
  'query-raw-generic.ts': (where) => `await tx.$queryRaw<{ id: string }>\`
    SELECT id FROM channel_listings ${where}
  \`;`,
  'execute-raw-tagged.ts': (where) => `await tx.$executeRaw\`
    UPDATE channel_listings SET synced_at = now() ${where}
  \`;`,
};

function sourceFor(statement) {
  return `export async function readListings(tx, organizationId, channelListingId) {
  ${statement}
}
`;
}

for (const [label, forms] of [['call', CALL_FORMS], ['tagged', TAGGED_FORMS]]) {
  test(`accepts ${label} forms that bind organization_id`, () => {
    for (const [file, statement] of Object.entries(forms)) {
      const result = scan({ [file]: sourceFor(statement(SCOPED_WHERE)) });
      assert.equal(result.status, 0, `${file}: ${result.stdout}${result.stderr}`);
    }
  });

  test(`rejects ${label} forms without organization scope`, () => {
    for (const [file, statement] of Object.entries(forms)) {
      const result = scan({ [file]: sourceFor(statement(UNSCOPED_WHERE)) });
      assert.equal(result.status, 1, `${file}: ${result.stdout}${result.stderr}`);
      assert.ok(result.stdout.includes(file), result.stdout);
    }
  });
}

test('accepts an exemption comment on an advisory lock keyed by the organization id', () => {
  const source = `export async function lockListingTraffic(tx, organizationId) {
  const lockKey = \`listing-traffic:\${organizationId}\`;
  await tx.$queryRaw(Prisma.sql\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(\${lockKey}, 0))::text AS "lock"
  \`);
}
`;
  const result = scan({ 'listing-traffic-lock.ts': source });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('accepts the organization key composed in the lines above the lock', () => {
  // The shape most owner locks use: organizationId arrives as a parameter and
  // the key is composed just above the statement that binds it.
  const source = `export async function lockSellpiaInventoryTransaction(
  tx,
  organizationId,
) {
  const lockKey = \`inventory-sellpia:\${organizationId}:sellpia_inventory\`;
  await tx.$queryRaw\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(\${lockKey}, 0))::text AS "lock"
  \`;
}
`;
  const result = scan({ 'inventory-transaction-lock.ts': source });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('rejects an advisory-lock exemption whose key is not organization-derived', () => {
  const source = `export async function lockNamed(tx, key) {
  await tx.$queryRaw(Prisma.sql\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(\${key}, 0))::text AS "lock"
  \`);
}
`;
  const result = scan({ 'blind-lock.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('blind-lock.ts'), result.stdout);
});

test('does not accept an organization mentioned only below the lock', () => {
  // The organization evidence has to sit at the lock, not anywhere in the file.
  // A neighbouring function is not this lock's key.
  const source = `export async function lockNamed(tx, key) {
  await tx.$queryRaw(Prisma.sql\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(\${key}, 0))::text AS "lock"
  \`);
}

export async function readListings(tx, organizationId) {
  return tx.sourcingCandidate.findMany({ where: { organizationId } });
}
`;
  const result = scan({ 'lock-then-scoped-read.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('lock-then-scoped-read.ts'), result.stdout);
});

test('does not reach past eight lines above the lock for organization evidence', () => {
  // A scanner cannot tell a used parameter from a stale one, so the reach is
  // what bounds the damage: an organizationId this far above the lock is not
  // evidence about this key. Nearer than this it would still be taken on
  // trust — the marker's reviewer is the real check.
  const source = `export async function lockUnrelated(
  tx,
  organizationId,
  unrelatedKey,
) {
  const scope = 'unrelated-scope';
  const label = scope.toUpperCase();
  const trimmed = label.trim();
  const size = trimmed.length;
  const suffix = String(size);
  void suffix;
  await tx.$queryRaw(Prisma.sql\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(\${unrelatedKey}, 0))::text AS "lock"
  \`);
}
`;
  const result = scan({ 'stale-organization-parameter.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('stale-organization-parameter.ts'), result.stdout);
});

test('rejects a call form that only carries the exemption marker', () => {
  const source = `export async function readListings(tx, channelListingId) {
  return tx.$queryRaw(Prisma.sql\`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT id FROM channel_listings WHERE channel_listing_id = \${channelListingId}::uuid
  \`);
}
`;
  const result = scan({ 'marker-without-lock.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('marker-without-lock.ts'), result.stdout);
});

test('leaves tests, specs and test-helpers to their own coverage', () => {
  const source = sourceFor(CALL_FORMS['query-raw-call.ts'](UNSCOPED_WHERE));
  const result = scan({
    '__tests__/raw.ts': source,
    'raw.spec.ts': source,
    'test-helpers/raw.ts': source,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

// KID-257: a lock that is global by design (one key for every organization)
// is exempt only with a written reason next to the lock call.
test('accepts a global advisory lock whose marker states the reason', () => {
  const source = `export async function lockKidItemCodeSequence(tx) {
  await tx.$queryRaw\`
    -- queryraw-tenancy-exempt: global lock — KID item codes come from one database-wide sequence.
    SELECT pg_advisory_xact_lock(hashtextextended('kid-item-code', 0))::text AS "lock"
  \`;
}
`;
  const result = scan({ 'global-code-lock.ts': source });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('accepts a session-level global advisory lock with a reason', () => {
  const source = `export async function lockMigrationRunner(tx) {
  await tx.$executeRaw\`
    -- queryraw-tenancy-exempt: global lock — one migration runner per database.
    SELECT pg_advisory_lock(4242)
  \`;
}
`;
  const result = scan({ 'global-session-lock.ts': source });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('rejects a global-lock marker without a reason', () => {
  const source = `export async function lockEverything(tx) {
  await tx.$queryRaw\`
    -- queryraw-tenancy-exempt: global lock
    SELECT pg_advisory_xact_lock(hashtextextended('everything', 0))::text AS "lock"
  \`;
}
`;
  const result = scan({ 'reasonless-global-lock.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('reasonless-global-lock.ts'), result.stdout);
});

test('rejects a global-lock marker on raw SQL that takes no advisory lock', () => {
  const source = `export async function readEverything(tx) {
  await tx.$queryRaw\`
    -- queryraw-tenancy-exempt: global lock — not really a lock.
    SELECT id FROM channel_listings
  \`;
}
`;
  const result = scan({ 'global-marker-without-lock.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('global-marker-without-lock.ts'), result.stdout);
});

test('rejects a global-lock marker more than eight lines from the lock call', () => {
  const padding = Array.from({ length: 9 }, (_, i) => `    -- note ${i}`).join('\n');
  const source = `export async function lockFarAway(tx) {
  await tx.$queryRaw\`
    -- queryraw-tenancy-exempt: global lock — reason far from the call.
${padding}
    SELECT pg_advisory_xact_lock(hashtextextended('far', 0))::text AS "lock"
  \`;
}
`;
  const result = scan({ 'far-global-lock.ts': source });
  assert.equal(result.status, 1, result.stdout + result.stderr);
});
