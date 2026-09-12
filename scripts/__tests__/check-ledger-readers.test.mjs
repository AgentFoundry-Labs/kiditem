import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(
  new URL('../check-ledger-readers.mjs', import.meta.url),
);

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function runScanner(root) {
  return spawnSync(process.execPath, [scanner, '--root', root], {
    encoding: 'utf8',
  });
}

test('rejects undeclared Prisma and raw SQL ledger reads, then passes after removal', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-ledger-readers-'));

  try {
    write(
      root,
      'scripts/ledger-readers.json',
      JSON.stringify({
        version: 1,
        scanRoots: ['apps/server/src'],
        ledgers: [
          {
            name: 'Advertising target day',
            table: 'channel_ad_target_daily_snapshots',
            prismaModel: 'channelAdTargetDailySnapshot',
            reader: 'apps/server/src/advertising/read/ad-target-reader.ts',
            ownerPublications: [
              {
                path: 'apps/server/src/advertising/write/ad-target-owner.ts',
                reason:
                  'Locks and verifies rows inside the terminal publication transaction.',
              },
            ],
            legacyReaders: [
              {
                path: 'apps/server/src/advertising/read/legacy-keyword-reader.ts',
                removeWith: 'KID-80',
                reason: 'Moves into the canonical keyword reader in KID-80.',
              },
            ],
          },
        ],
      }),
    );
    write(
      root,
      'apps/server/src/advertising/read/ad-target-reader.ts',
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/advertising/write/ad-target-owner.ts',
      'tx.channelAdTargetDailySnapshot.count({});\n',
    );
    write(
      root,
      'apps/server/src/advertising/read/legacy-keyword-reader.ts',
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/example.spec.ts',
      'tx.channelAdTargetDailySnapshot.findFirst({});\n',
    );
    write(
      root,
      'apps/server/src/seed/ad-target.seed.ts',
      'sql`SELECT * FROM channel_ad_target_daily_snapshots`;\n',
    );
    write(
      root,
      'apps/server/src/prisma-consumer.ts',
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/raw-sql-consumer.ts',
      'sql`SELECT *\nFROM "channel_ad_target_daily_snapshots"`;\n',
    );
    write(
      root,
      'apps/server/src/listing-prisma-consumer.ts',
      'tx.channelListingDailySnapshot.findMany({ select: { adSpend: true } });\n',
    );
    write(
      root,
      'apps/server/src/listing-sql-consumer.ts',
      'sql`SELECT ad_spend FROM channel_listing_daily_snapshots`;\n',
    );
    write(
      root,
      'apps/server/src/coverage-consumer.ts',
      'const status = row.adCoverageStatus;\n',
    );
    write(
      root,
      'apps/server/src/advertising/adapter/out/repository/ad-traffic-source.repository.ts',
      'tx.channelListingDailySnapshot.findMany({ select: { adSpend: true } });\n',
    );

    const failed = runScanner(root);
    const failedOutput = `${failed.stdout}\n${failed.stderr}`;
    assert.equal(failed.status, 1, failedOutput);
    assert.match(failedOutput, /prisma-consumer\.ts.*Prisma read/);
    assert.match(failedOutput, /raw-sql-consumer\.ts.*raw SQL read/);
    assert.match(
      failedOutput,
      /listing-prisma-consumer\.ts.*retired Prisma read/,
    );
    assert.match(
      failedOutput,
      /listing-sql-consumer\.ts.*retired raw SQL read/,
    );
    assert.match(
      failedOutput,
      /coverage-consumer\.ts.*retired coverage-status read/,
    );

    rmSync(path.join(root, 'apps/server/src/prisma-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/raw-sql-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/listing-prisma-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/listing-sql-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/coverage-consumer.ts'));

    assert.doesNotThrow(() => {
      execFileSync(process.execPath, [scanner, '--root', root], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    const legacyGate = spawnSync(
      process.execPath,
      [scanner, '--root', root, '--require-no-legacy'],
      { encoding: 'utf8' },
    );
    const legacyOutput = `${legacyGate.stdout}\n${legacyGate.stderr}`;
    assert.equal(legacyGate.status, 1, legacyOutput);
    assert.match(legacyOutput, /legacy-keyword-reader\.ts.*KID-80/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
