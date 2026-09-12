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
        prismaSchemaRoots: ['prisma'],
        ledgers: [
          {
            name: 'Advertising target day',
            table: 'channel_ad_target_daily_snapshots',
            prismaModel: 'channelAdTargetDailySnapshot',
            prismaType: 'ChannelAdTargetDailySnapshot',
            relationNames: [
              'adTargetDaily',
              'adTargetDailySnapshots',
              'channelAdTargetDailySnapshots',
            ],
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
      'prisma/models/advertising.prisma',
      `model Organization {
  id                            String                         @id
  channelAdTargetDailySnapshots ChannelAdTargetDailySnapshot[]
}

model ChannelScrapeSnapshot {
  id                     String                         @id
  adTargetDailySnapshots ChannelAdTargetDailySnapshot[] @relation("AdTargetDailyRawSnapshot")
}

model AdAction {
  id              String                        @id
  adTargetDailyId String?
  adTargetDaily   ChannelAdTargetDailySnapshot? @relation(fields: [adTargetDailyId], references: [id])
}

model ChannelAdTargetDailySnapshot {
  id             String                 @id
  organizationId String
  rawSnapshotId  String?
  organization  Organization           @relation(fields: [organizationId], references: [id])
  rawSnapshot   ChannelScrapeSnapshot? @relation("AdTargetDailyRawSnapshot", fields: [rawSnapshotId], references: [id])
  adActions     AdAction[]
}
`,
    );
    write(
      root,
      'apps/server/src/advertising/read/ad-target-reader.ts',
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/advertising/write/ad-target-owner.ts',
      "const ledger = tx.channelAdTargetDailySnapshot;\nledger.createMany({ data: [] });\ntx.organization.update({ where: { id: 'org-1' }, data: { channelAdTargetDailySnapshots: { create: { id: 'owned' } } } });\ntx.channelScrapeSnapshot.update({ where: { id: 'snapshot-1' }, data: { adTargetDailySnapshots: { set: [{ id: 'owned' }] } } });\nsql`INSERT INTO channel_ad_target_daily_snapshots (id) VALUES ('owned')`;\nsql`UPDATE channel_ad_target_daily_snapshots SET id = 'owned'`;\nsql`DELETE FROM channel_ad_target_daily_snapshots WHERE id = 'owned'`;\n",
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
      'apps/server/src/advertising/read/unregistered-consumer.ts',
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/raw-sql-consumer.ts',
      'sql`SELECT *\nFROM "channel_ad_target_daily_snapshots"`;\n',
    );
    write(
      root,
      'apps/server/src/raw-sql-insert-consumer.ts',
      'sql`INSERT INTO "channel_ad_target_daily_snapshots" (id) VALUES (\'unowned\')`;\n',
    );
    write(
      root,
      'apps/server/src/raw-sql-update-consumer.ts',
      "sql`UPDATE public.channel_ad_target_daily_snapshots SET id = 'unowned'`;\n",
    );
    write(
      root,
      'apps/server/src/raw-sql-delete-consumer.ts',
      'sql`DELETE FROM "public"."channel_ad_target_daily_snapshots" WHERE id = \'unowned\'`;\n',
    );
    write(
      root,
      'apps/server/src/advertising/write/ad-target-owner-helper.ts',
      "sql`INSERT INTO channel_ad_target_daily_snapshots (id) VALUES ('lookalike')`;\n",
    );
    write(
      root,
      'apps/server/src/alias-consumer.ts',
      'const ledger = tx.channelAdTargetDailySnapshot;\nawait ledger.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/destructure-consumer.ts',
      'const { channelAdTargetDailySnapshot: ledger } = tx;\nawait ledger.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/bracket-consumer.ts',
      "await tx['channelAdTargetDailySnapshot'].findFirst({});\n",
    );
    write(
      root,
      'apps/server/src/mutation-consumer.ts',
      'await tx.channelAdTargetDailySnapshot.createMany({ data: [] });\n',
    );
    write(
      root,
      'apps/server/src/seed/runtime-consumer.ts',
      'await tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      'apps/server/src/relation-include-consumer.ts',
      'await tx.organization.findMany({ include: { channelAdTargetDailySnapshots: true } });\n',
    );
    write(
      root,
      'apps/server/src/relation-select-consumer.ts',
      'await tx.channelScrapeSnapshot.findMany({ select: { adTargetDailySnapshots: true } });\n',
    );
    write(
      root,
      'apps/server/src/relation-where-consumer.ts',
      'await tx.adAction.findMany({ where: { adTargetDaily: { isNot: null } } });\n',
    );
    write(
      root,
      'apps/server/src/destructured-parent-relation-consumer.ts',
      'const { adAction: actions } = tx;\nawait actions.findMany({ include: { adTargetDaily: true } });\n',
    );
    write(
      root,
      'apps/server/src/relation-update-many-consumer.ts',
      "await tx.adAction.updateMany({ where: { adTargetDaily: { isNot: null } }, data: { status: 'ready' } });\n",
    );
    write(
      root,
      'apps/server/src/relation-update-include-consumer.ts',
      "await tx.adAction.update({ where: { id: 'action-1' }, data: { status: 'ready' }, include: { adTargetDaily: true } });\n",
    );
    write(
      root,
      'apps/server/src/detached-relation-where-consumer.ts',
      'const where = { adTargetDaily: { isNot: null } };\nawait tx.adAction.findMany({ where });\n',
    );
    write(
      root,
      'apps/server/src/detached-relation-include-consumer.ts',
      'const include = { channelAdTargetDailySnapshots: true };\nawait tx.organization.findMany({ include });\n',
    );
    write(
      root,
      'apps/server/src/spread-relation-alias-consumer.ts',
      'const relationFilter = { adTargetDaily: { isNot: null } };\nconst alias = relationFilter;\nconst args = { where: { ...alias } };\nconst adActions = tx.adAction;\nawait adActions.findMany(args);\n',
    );
    write(
      root,
      'apps/server/src/standalone-dto.ts',
      'export const response = { adTargetDaily: null };\n',
    );
    write(
      root,
      'apps/server/src/array-relation-filter-consumer.ts',
      'const filters = [{ adTargetDaily: { isNot: null } }];\nawait tx.adAction.findMany({ where: { AND: [...filters] } });\n',
    );
    write(
      root,
      'apps/server/src/query-then-dto-mapper.ts',
      'const actions = await tx.adAction.findMany({});\nexport const response = actions.map(() => ({ adTargetDaily: null }));\n',
    );
    write(
      root,
      'apps/server/src/scoped-benign-relation-name.ts',
      "async function loadActions() {\n  const where = { status: 'ready' };\n  return tx.adAction.findMany({ where });\n}\nfunction mapDto() {\n  const where = { adTargetDaily: null };\n  return where;\n}\n",
    );
    write(
      root,
      'apps/server/src/scoped-ledger-relation-consumer.ts',
      "async function loadActions() {\n  const where = { adTargetDaily: { isNot: null } };\n  return tx.adAction.findMany({ where });\n}\nfunction unrelated() {\n  const where = { status: 'ready' };\n  return where;\n}\n",
    );
    write(
      root,
      'apps/server/src/listing-prisma-consumer.ts',
      'tx.channelListingDailySnapshot.findMany({ select: { adSpend: true } });\n',
    );
    write(
      root,
      'apps/server/src/listing-prisma-alias-consumer.ts',
      'const rows = tx.channelListingDailySnapshot;\nrows.findMany({ select: { adSpend: true } });\n',
    );
    write(
      root,
      'apps/server/src/listing-prisma-bracket-alias-consumer.ts',
      "const rows = tx['channelListingDailySnapshot'];\nrows.findMany({ select: { adRevenue: true } });\n",
    );
    write(
      root,
      'apps/server/src/listing-prisma-destructure-consumer.ts',
      'const { channelListingDailySnapshot: rows } = tx;\nrows.findMany({ select: { adClicks: true } });\n',
    );
    write(
      root,
      'apps/server/src/listing-traffic-only-consumer.ts',
      'const rows = tx.channelListingDailySnapshot;\nrows.findMany({ select: { traffic: true } });\n',
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
    assert.match(failedOutput, /prisma-consumer\.ts.*Prisma delegate access/);
    assert.match(
      failedOutput,
      /advertising\/read\/unregistered-consumer\.ts.*Prisma delegate access/,
    );
    assert.match(failedOutput, /raw-sql-consumer\.ts.*raw SQL read/);
    assert.match(failedOutput, /raw-sql-insert-consumer\.ts.*raw SQL mutation/);
    assert.match(failedOutput, /raw-sql-update-consumer\.ts.*raw SQL mutation/);
    assert.match(failedOutput, /raw-sql-delete-consumer\.ts.*raw SQL mutation/);
    assert.match(failedOutput, /ad-target-owner-helper\.ts.*raw SQL mutation/);
    assert.doesNotMatch(failedOutput, /ad-target-owner\.ts/);
    assert.match(failedOutput, /alias-consumer\.ts.*Prisma delegate access/);
    assert.match(
      failedOutput,
      /destructure-consumer\.ts.*Prisma delegate access/,
    );
    assert.match(failedOutput, /bracket-consumer\.ts.*Prisma delegate access/);
    assert.match(failedOutput, /mutation-consumer\.ts.*Prisma delegate access/);
    assert.match(
      failedOutput,
      /seed\/runtime-consumer\.ts.*Prisma delegate access/,
    );
    assert.match(
      failedOutput,
      /relation-include-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /relation-select-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /relation-where-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /destructured-parent-relation-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /relation-update-many-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /relation-update-include-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /detached-relation-where-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /detached-relation-include-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /spread-relation-alias-consumer\.ts.*Prisma relation read/,
    );
    assert.doesNotMatch(failedOutput, /standalone-dto\.ts/);
    assert.match(
      failedOutput,
      /array-relation-filter-consumer\.ts.*Prisma relation read/,
    );
    assert.doesNotMatch(failedOutput, /query-then-dto-mapper\.ts/);
    assert.doesNotMatch(failedOutput, /scoped-benign-relation-name\.ts/);
    assert.match(
      failedOutput,
      /scoped-ledger-relation-consumer\.ts.*Prisma relation read/,
    );
    assert.match(
      failedOutput,
      /listing-prisma-consumer\.ts.*retired Prisma read/,
    );
    assert.match(
      failedOutput,
      /listing-prisma-alias-consumer\.ts.*retired Prisma read/,
    );
    assert.match(
      failedOutput,
      /listing-prisma-bracket-alias-consumer\.ts.*retired Prisma read/,
    );
    assert.match(
      failedOutput,
      /listing-prisma-destructure-consumer\.ts.*retired Prisma read/,
    );
    assert.doesNotMatch(failedOutput, /listing-traffic-only-consumer\.ts/);
    assert.match(
      failedOutput,
      /listing-sql-consumer\.ts.*retired raw SQL read/,
    );
    assert.match(
      failedOutput,
      /coverage-consumer\.ts.*retired coverage-status read/,
    );

    rmSync(path.join(root, 'apps/server/src/prisma-consumer.ts'));
    rmSync(
      path.join(
        root,
        'apps/server/src/advertising/read/unregistered-consumer.ts',
      ),
    );
    rmSync(path.join(root, 'apps/server/src/raw-sql-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/raw-sql-insert-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/raw-sql-update-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/raw-sql-delete-consumer.ts'));
    rmSync(
      path.join(
        root,
        'apps/server/src/advertising/write/ad-target-owner-helper.ts',
      ),
    );
    rmSync(path.join(root, 'apps/server/src/alias-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/destructure-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/bracket-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/mutation-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/seed/runtime-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/relation-include-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/relation-select-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/relation-where-consumer.ts'));
    rmSync(
      path.join(
        root,
        'apps/server/src/destructured-parent-relation-consumer.ts',
      ),
    );
    rmSync(path.join(root, 'apps/server/src/relation-update-many-consumer.ts'));
    rmSync(
      path.join(root, 'apps/server/src/relation-update-include-consumer.ts'),
    );
    rmSync(
      path.join(root, 'apps/server/src/detached-relation-where-consumer.ts'),
    );
    rmSync(
      path.join(root, 'apps/server/src/detached-relation-include-consumer.ts'),
    );
    rmSync(
      path.join(root, 'apps/server/src/spread-relation-alias-consumer.ts'),
    );
    rmSync(path.join(root, 'apps/server/src/listing-prisma-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/listing-prisma-alias-consumer.ts'));
    rmSync(
      path.join(
        root,
        'apps/server/src/listing-prisma-bracket-alias-consumer.ts',
      ),
    );
    rmSync(
      path.join(root, 'apps/server/src/listing-prisma-destructure-consumer.ts'),
    );
    rmSync(path.join(root, 'apps/server/src/listing-sql-consumer.ts'));
    rmSync(path.join(root, 'apps/server/src/coverage-consumer.ts'));
    rmSync(
      path.join(root, 'apps/server/src/array-relation-filter-consumer.ts'),
    );
    rmSync(
      path.join(root, 'apps/server/src/scoped-ledger-relation-consumer.ts'),
    );

    const canonicalReader =
      'apps/server/src/advertising/read/ad-target-reader.ts';
    const legacyReader =
      'apps/server/src/advertising/read/legacy-keyword-reader.ts';
    const directMutationCases = [
      [
        'create',
        "await tx.channelAdTargetDailySnapshot.create({ data: { id: 'target-1' } });\n",
        canonicalReader,
      ],
      [
        'createMany',
        'const ledger = tx.channelAdTargetDailySnapshot;\nawait ledger.createMany({ data: [] });\n',
        legacyReader,
      ],
      [
        'createManyAndReturn',
        "await tx['channelAdTargetDailySnapshot'].createManyAndReturn({ data: [] });\n",
        canonicalReader,
      ],
      [
        'delete',
        "const { channelAdTargetDailySnapshot: ledger } = tx;\nawait ledger.delete({ where: { id: 'target-1' } });\n",
        canonicalReader,
      ],
      [
        'deleteMany',
        'await tx.channelAdTargetDailySnapshot.deleteMany({ where: {} });\n',
        legacyReader,
      ],
      [
        'update',
        "const ledger = tx.channelAdTargetDailySnapshot;\nawait ledger.update({ where: { id: 'target-1' }, data: { id: 'target-2' } });\n",
        canonicalReader,
      ],
      [
        'updateMany',
        "await tx['channelAdTargetDailySnapshot'].updateMany({ data: { id: 'target-2' } });\n",
        legacyReader,
      ],
      [
        'updateManyAndReturn',
        "const { channelAdTargetDailySnapshot: ledger } = tx;\nawait ledger.updateManyAndReturn({ data: { id: 'target-2' } });\n",
        canonicalReader,
      ],
      [
        'upsert',
        "await tx.channelAdTargetDailySnapshot.upsert({ where: { id: 'target-1' }, create: { id: 'target-1' }, update: { id: 'target-2' } });\n",
        legacyReader,
      ],
    ];
    for (const [method, source, target] of directMutationCases) {
      write(root, target, source);
      const result = runScanner(root);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 1, `${method}: ${output}`);
      assert.match(
        output,
        new RegExp(`${path.basename(target)}.*Prisma delegate mutation`),
        method,
      );
      write(root, target, 'tx.channelAdTargetDailySnapshot.findMany({});\n');
    }

    const nestedMutationCases = [
      [
        'create',
        "const { adAction: actions } = tx;\nawait actions.update({ where: { id: 'action-1' }, data: { adTargetDaily: { create: { id: 'target-1' } } } });\n",
      ],
      [
        'update',
        "const data = { adTargetDaily: { update: { id: 'target-2' } } };\nawait tx.adAction.update({ where: { id: 'action-1' }, data });\n",
      ],
      [
        'delete',
        "const targetMutation = { adTargetDaily: { delete: true } };\nawait tx.adAction.update({ where: { id: 'action-1' }, data: { ...targetMutation } });\n",
      ],
    ];
    for (const [index, [operation, source]] of nestedMutationCases.entries()) {
      const target = index % 2 === 0 ? canonicalReader : legacyReader;
      write(root, target, source);
      const result = runScanner(root);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 1, `${operation}: ${output}`);
      assert.match(
        output,
        new RegExp(`${path.basename(target)}.*Prisma relation mutation`),
        operation,
      );
      write(root, target, 'tx.channelAdTargetDailySnapshot.findMany({});\n');
    }

    const reverseRelationMutationCases = [
      [
        'connect',
        "await tx.organization.update({ where: { id: 'org-1' }, data: { channelAdTargetDailySnapshots: { connect: [{ id: 'target-1' }] } } });\n",
        canonicalReader,
      ],
      [
        'disconnect',
        "await tx.channelScrapeSnapshot.update({ where: { id: 'snapshot-1' }, data: { adTargetDailySnapshots: { disconnect: [{ id: 'target-1' }] } } });\n",
        legacyReader,
      ],
      [
        'set',
        "await tx.organization.update({ where: { id: 'org-1' }, data: { channelAdTargetDailySnapshots: { set: [{ id: 'target-1' }] } } });\n",
        legacyReader,
      ],
    ];
    for (const [operation, source, target] of reverseRelationMutationCases) {
      write(root, target, source);
      const result = runScanner(root);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 1, `${operation}: ${output}`);
      assert.match(
        output,
        new RegExp(`${path.basename(target)}.*Prisma relation mutation`),
        operation,
      );
      write(root, target, 'tx.channelAdTargetDailySnapshot.findMany({});\n');
    }

    const readOnlyRelationCases = [
      [
        'parent update filter',
        "await tx.adAction.update({ where: { adTargetDaily: { isNot: null } }, data: { status: 'ready' } });\n",
        canonicalReader,
      ],
      [
        'parent update include',
        "await tx.adAction.update({ where: { id: 'action-1' }, data: { status: 'ready' }, include: { adTargetDaily: true } });\n",
        legacyReader,
      ],
      [
        'forward relation connect',
        "await tx.adAction.update({ where: { id: 'action-1' }, data: { adTargetDaily: { connect: { id: 'target-1' } } } });\n",
        canonicalReader,
      ],
    ];
    for (const [label, source, target] of readOnlyRelationCases) {
      write(root, target, source);
      assert.doesNotThrow(() => {
        execFileSync(process.execPath, [scanner, '--root', root], {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }, label);
      write(root, target, 'tx.channelAdTargetDailySnapshot.findMany({});\n');
    }

    write(
      root,
      canonicalReader,
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );
    write(
      root,
      legacyReader,
      'tx.channelAdTargetDailySnapshot.findMany({});\n',
    );

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

test('rejects relation names that drift from the Prisma schema', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-ledger-relations-'));

  try {
    write(
      root,
      'scripts/ledger-readers.json',
      JSON.stringify({
        version: 1,
        scanRoots: ['apps/server/src'],
        prismaSchemaRoots: ['prisma'],
        ledgers: [
          {
            name: 'Advertising target day',
            table: 'channel_ad_target_daily_snapshots',
            prismaModel: 'channelAdTargetDailySnapshot',
            prismaType: 'ChannelAdTargetDailySnapshot',
            relationNames: ['channelAdTargetDailySnapshots'],
            reader: 'apps/server/src/advertising/read/ad-target-reader.ts',
          },
        ],
      }),
    );
    write(
      root,
      'prisma/schema.prisma',
      `model Organization {
  id                            String                         @id
  channelAdTargetDailySnapshots ChannelAdTargetDailySnapshot[]
}

model AdAction {
  id              String                        @id
  adTargetDailyId String?
  adTargetDaily   ChannelAdTargetDailySnapshot? @relation(fields: [adTargetDailyId], references: [id])
}

model ChannelAdTargetDailySnapshot {
  id             String       @id
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  adActions      AdAction[]
}
`,
    );
    write(
      root,
      'apps/server/src/advertising/read/ad-target-reader.ts',
      'export const reader = true;\n',
    );

    const result = runScanner(root);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 1, output);
    assert.match(
      output,
      /relationNames do not match the Prisma schema.*missing: adTargetDaily/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
