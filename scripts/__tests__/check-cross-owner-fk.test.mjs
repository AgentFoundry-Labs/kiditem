import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyRelations,
  loadConfig,
  parseDeclaredModels,
  parseRelationEdges,
} from '../check-cross-owner-fk.mjs';

const scanner = fileURLToPath(
  new URL('../check-cross-owner-fk.mjs', import.meta.url),
);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const CONFIG = {
  owners: {
    ChannelAccount: 'channels',
    ChannelListing: 'channels',
    MasterProduct: 'products',
    Organization: 'scope',
    OrganizationMembership: 'scope',
    Order: 'orders',
    OrderItem: 'orders',
    SourceImportRun: 'runs',
    User: 'scope',
  },
  scopeTargets: ['Organization', 'OrganizationMembership', 'User'],
  keptTargets: ['SourceImportRun'],
  allowlist: [],
};

const CHANNELS_FIXTURE_CONFIG = {
  ...CONFIG,
  owners: Object.fromEntries(
    Object.entries(CONFIG.owners).filter(
      ([model]) => model !== 'Order' && model !== 'OrderItem',
    ),
  ),
};

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

// The models the data file names, so the scanner's declared-name check has
// something to resolve them against.
const SUPPORTING_SOURCE = `model Organization {
  id String @id @default(uuid()) @db.Uuid
}

model User {
  id String @id @default(uuid()) @db.Uuid
}

model OrganizationMembership {
  id String @id @default(uuid()) @db.Uuid
}

model SourceImportRun {
  id String @id @default(uuid()) @db.Uuid
}

model MasterProduct {
  id String @id @default(uuid()) @db.Uuid
}
`;

const CHANNELS_SOURCE = `model ChannelAccount {
  id String @id @default(uuid()) @db.Uuid
}

model ChannelListing {
  id String @id @default(uuid()) @db.Uuid
}
`;

const CHANNELS_BOUNDARY_SOURCE = `model ChannelAccount {
  id String @id @default(uuid()) @db.Uuid

  organization Organization @relation(fields: [organizationId], references: [id])
  requestedBy User @relation(fields: [requestedByUserId], references: [id])
  sourceImportRun SourceImportRun @relation(fields: [sourceImportRunId], references: [id])
  listing ChannelListing @relation(fields: [listingId], references: [id])
}

model ChannelListing {
  id String @id @default(uuid()) @db.Uuid

  account ChannelAccount @relation(fields: [channelAccountId], references: [id])
}
`;

const MIXED_OWNER_SOURCE = `model Order {
  id String @id @default(uuid()) @db.Uuid

  listing ChannelListing @relation(fields: [listingId], references: [id])
}

model ChannelListing {
  id String @id @default(uuid()) @db.Uuid
}
`;

function writeSchema(root, ordersSource) {
  write(root, 'prisma/models/orders.prisma', ordersSource);
  write(root, 'prisma/models/core.prisma', SUPPORTING_SOURCE);
  write(root, 'prisma/models/channels.prisma', CHANNELS_SOURCE);
}

function runScanner(root) {
  return spawnSync(process.execPath, [scanner, '--root', root], {
    encoding: 'utf8',
  });
}

const ORDERS_SOURCE = `/// @namespace Orders
model Order {
  id             String @id @default(uuid()) @db.Uuid
  organizationId String @map("organization_id") @db.Uuid

  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  sourceImportRun SourceImportRun? @relation("OrderImport", fields: [sourceImportRunId, organizationId], references: [id, organizationId], onDelete: Restrict)
  channelAccount  ChannelAccount   @relation(fields: [channelAccountId, organizationId], references: [id, organizationId], onDelete: Restrict)
  items           OrderItem[]

  @@map("orders")
}

/// @namespace Orders
model OrderItem {
  id String @id @default(uuid()) @db.Uuid

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("order_items")
}
`;

const UNREADABLE_SOURCE = `/// @namespace Orders
model Order {
  id String @id @default(uuid()) @db.Uuid

  channelAccount ChannelAccount @relation(
    fields: [channelAccountId, organizationId],
    references: [id, organizationId],
  )
  mapped ChannelListing @relation(map: "order_listing)fk", fields: [listingId], references: [id])
  items  OrderItem[]    @relation("OrderItems")

  @@map("orders")
}
`;

test('reports a @relation it cannot read on one line instead of skipping it', () => {
  const { edges, unparsed } = parseRelationEdges(
    'orders.prisma',
    UNREADABLE_SOURCE,
  );

  assert.deepEqual(edges, []);
  assert.deepEqual(
    unparsed.map(({ line, text }) => ({ line, text: text.trim() })),
    [
      {
        line: 5,
        text: 'channelAccount ChannelAccount @relation(',
      },
      {
        line: 9,
        text: 'mapped ChannelListing @relation(map: "order_listing)fk", fields: [listingId], references: [id])',
      },
    ],
  );
});

test('reads the model, field, and target of every @relation that owns fields', () => {
  const { edges } = parseRelationEdges('orders.prisma', ORDERS_SOURCE);

  assert.deepEqual(
    edges.map(({ model, field, target }) => ({ model, field, target })),
    [
      { model: 'Order', field: 'organization', target: 'Organization' },
      { model: 'Order', field: 'sourceImportRun', target: 'SourceImportRun' },
      { model: 'Order', field: 'channelAccount', target: 'ChannelAccount' },
      { model: 'OrderItem', field: 'order', target: 'Order' },
    ],
  );
  assert.deepEqual(
    edges.map((edge) => edge.line),
    [6, 7, 8, 18],
  );
});

test('declares model names without inferring an owner from the Prisma filename', () => {
  assert.deepEqual(
    [...parseDeclaredModels(SUPPORTING_SOURCE)],
    [
      'Organization',
      'User',
      'OrganizationMembership',
      'SourceImportRun',
      'MasterProduct',
    ],
  );
});

test('classifies scope, SourceImportRun, intra-owner, and cross-owner relations', () => {
  const { edges } = parseRelationEdges('orders.prisma', ORDERS_SOURCE);
  const result = classifyRelations({ edges, config: CONFIG });

  assert.deepEqual(
    result.classifications.map(({ field, kind }) => ({ field, kind })),
    [
      { field: 'organization', kind: 'scope' },
      { field: 'sourceImportRun', kind: 'kept' },
      { field: 'channelAccount', kind: 'cross' },
      { field: 'order', kind: 'intra' },
    ],
  );
  assert.deepEqual(result.summary, {
    total: 4,
    scope: 1,
    kept: 1,
    intra: 1,
    cross: 1,
  });
  assert.deepEqual(result.unlisted.map((edge) => edge.key), [
    'orders.Order -> channels.ChannelAccount',
  ]);
});

test('same-file models retain distinct configured owners regardless of filename', () => {
  const classify = (fileName) => {
    const { edges } = parseRelationEdges(fileName, MIXED_OWNER_SOURCE);
    const result = classifyRelations({ edges, config: CONFIG });
    return result.classifications.map(({ field, kind, sourceOwner, targetOwner, key }) => ({
      field,
      kind,
      sourceOwner,
      targetOwner,
      key,
    }));
  };

  const expected = [
    {
      field: 'listing',
      kind: 'cross',
      sourceOwner: 'orders',
      targetOwner: 'channels',
      key: 'orders.Order -> channels.ChannelListing',
    },
  ];
  assert.deepEqual(classify('core.prisma'), expected);
  assert.deepEqual(classify('orders.prisma'), expected);
});

test('Channels references to Organization, User, and SourceImportRun require exact transition entries', () => {
  const { edges } = parseRelationEdges(
    'channels.prisma',
    CHANNELS_BOUNDARY_SOURCE,
  );
  const result = classifyRelations({ edges, config: CONFIG });

  assert.deepEqual(
    result.classifications.map(({ field, kind }) => ({ field, kind })),
    [
      { field: 'organization', kind: 'cross' },
      { field: 'requestedBy', kind: 'cross' },
      { field: 'sourceImportRun', kind: 'cross' },
      { field: 'listing', kind: 'intra' },
      { field: 'account', kind: 'intra' },
    ],
  );
  assert.deepEqual(
    result.unlisted.map(({ key }) => key),
    [
      'channels.ChannelAccount -> scope.Organization',
      'channels.ChannelAccount -> scope.User',
      'channels.ChannelAccount -> runs.SourceImportRun',
    ],
  );
});

test('an undeclared scope target with no owner remains unknown', () => {
  const { edges } = parseRelationEdges(
    'channels.prisma',
    `model ChannelAccount {
  scopeAlias MissingScope @relation(fields: [scopeAliasId], references: [id])
}
`,
  );
  const result = classifyRelations({
    edges,
    config: {
      ...CONFIG,
      scopeTargets: ['MissingScope'],
    },
  });

  assert.deepEqual(
    result.classifications.map(({ field, kind }) => ({ field, kind })),
    [{ field: 'scopeAlias', kind: 'unknown' }],
  );
  assert.equal(result.summary.scope, 0);
  assert.deepEqual(result.unknownTargets.map(({ target }) => target), [
    'MissingScope',
  ]);
});

test('a relation source without a configured owner is not scope-exempt', () => {
  const { edges } = parseRelationEdges(
    'orders.prisma',
    `model UnownedSource {
  organization Organization @relation(fields: [organizationId], references: [id])
}
`,
  );
  const result = classifyRelations({ edges, config: CONFIG });

  assert.deepEqual(
    result.classifications.map(({ field, kind }) => ({ field, kind })),
    [{ field: 'organization', kind: 'unknown' }],
  );
  assert.equal(result.summary.scope, 0);
  assert.deepEqual(result.unknownSources.map(({ model }) => model), [
    'UnownedSource',
  ]);
});

test('exact transitional entries permit existing Channels scope and run relations', () => {
  const { edges } = parseRelationEdges(
    'channels.prisma',
    CHANNELS_BOUNDARY_SOURCE,
  );
  const result = classifyRelations({
    edges,
    config: {
      ...CONFIG,
      allowlist: [
        'channels.ChannelAccount -> scope.Organization',
        'channels.ChannelAccount -> scope.User',
        'channels.ChannelAccount -> runs.SourceImportRun',
      ],
    },
  });

  assert.deepEqual(result.unlisted, []);
  assert.deepEqual(result.stale, []);
  assert.equal(result.summary.cross, 3);
  assert.equal(result.summary.intra, 2);
});

test('the CLI rejects new Channels foreign keys to scope and SourceImportRun', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    write(root, 'prisma/models/channels.prisma', CHANNELS_BOUNDARY_SOURCE);
    write(root, 'prisma/models/core.prisma', SUPPORTING_SOURCE);
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({ version: 1, ...CHANNELS_FIXTURE_CONFIG }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /ChannelAccount\.organization -> scope\.Organization/,
    );
    assert.match(result.stderr, /ChannelAccount\.requestedBy -> scope\.User/);
    assert.match(
      result.stderr,
      /ChannelAccount\.sourceImportRun -> runs\.SourceImportRun/,
    );
    assert.equal((result.stderr.match(/not allowlisted/g) ?? []).length, 3);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('the configured owner map follows ChannelAd and current Rocket PO responsibility', () => {
  const config = loadConfig(repoRoot);

  assert.equal(config.owners.ChannelAdTargetDailySnapshot, 'advertising');
  assert.equal(config.owners.ChannelAdListingProductMonthlyFact, 'advertising');
  assert.equal(config.owners.CoupangRepresentativeKeywordOverride, 'advertising');
  assert.equal(config.owners.CoupangKeywordTracker, 'advertising');
  assert.equal(config.owners.CoupangKeywordRankDailySnapshot, 'advertising');
  assert.equal(config.owners.CoupangWingTrackedProduct, 'advertising');
  assert.equal(
    config.owners.CoupangWingTrackedProductDailySnapshot,
    'advertising',
  );
  assert.equal(config.owners.CoupangKeywordSerpDailySnapshot, 'advertising');
  assert.equal(config.owners.CoupangWingSalesRankDailySnapshot, 'advertising');
  assert.equal(config.owners.SellpiaSalesDailySnapshot, 'analytics');
  assert.equal(config.owners.SellpiaProductMonthlySales, 'analytics');
  assert.equal(config.owners.RocketPoCatalogSnapshot, 'channels');
  assert.equal(config.owners.RocketPoCatalogLine, 'channels');
});

test('treats an allowlisted cross-owner relation as satisfied and reports no stale entry', () => {
  const { edges } = parseRelationEdges('orders.prisma', ORDERS_SOURCE);
  const result = classifyRelations({
    edges,
    config: {
      ...CONFIG,
      allowlist: ['orders.Order -> channels.ChannelAccount'],
    },
  });

  assert.deepEqual(result.unlisted, []);
  assert.deepEqual(result.stale, []);
});

test('an allowlist entry covers one relation, so a second one between the same models fails', () => {
  const { edges } = parseRelationEdges(
    'orders.prisma',
    ORDERS_SOURCE.replace(
      '  items           OrderItem[]\n',
      '  settlementAccount ChannelAccount @relation("OrderSettlement", fields: [settlementAccountId, organizationId], references: [id, organizationId], onDelete: Restrict)\n',
    ),
  );
  const result = classifyRelations({
    edges,
    config: {
      ...CONFIG,
      allowlist: ['orders.Order -> channels.ChannelAccount'],
    },
  });

  assert.equal(result.summary.cross, 2);
  assert.deepEqual(
    result.unlisted.map((edge) => edge.field),
    ['settlementAccount'],
  );
  assert.deepEqual(result.stale, []);
});

test('reports an allowlist entry whose relation no longer exists as stale', () => {
  const { edges } = parseRelationEdges('orders.prisma', ORDERS_SOURCE);
  const result = classifyRelations({
    edges,
    config: {
      ...CONFIG,
      allowlist: [
        'orders.Order -> channels.ChannelAccount',
        'orders.Order -> supply.Supplier',
      ],
    },
  });

  assert.deepEqual(result.unlisted, []);
  assert.deepEqual(result.stale, ['orders.Order -> supply.Supplier']);
});

test('fails when a cross-owner relation is missing from the allowlist', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    writeSchema(root, ORDERS_SOURCE);
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({ version: 1, ...CONFIG }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /check:cross-owner-fk FAIL/);
    assert.match(
      result.stderr,
      /prisma\/models\/orders\.prisma:8 Order\.channelAccount -> channels\.ChannelAccount/,
    );
    assert.match(result.stderr, /not allowlisted/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('fails when an allowlist entry no longer matches a relation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    writeSchema(root, ORDERS_SOURCE);
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({
        version: 1,
        ...CONFIG,
        allowlist: [
          'orders.Order -> channels.ChannelAccount',
          'orders.Order -> supply.Supplier',
        ],
      }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /check:cross-owner-fk FAIL/);
    assert.match(
      result.stderr,
      /stale allowlist entry "orders\.Order -> supply\.Supplier"/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('fails when the data file names a model the schema does not declare', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    writeSchema(root, ORDERS_SOURCE);
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({
        version: 1,
        ...CONFIG,
        owners: { ...CONFIG.owners, RetiredModel: 'channels' },
        allowlist: ['orders.Order -> channels.ChannelAccount'],
      }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /check:cross-owner-fk FAIL/);
    assert.match(result.stderr, /RetiredModel/);
    assert.match(result.stderr, /unknown|undeclared/i);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('fails when a declared model without relations has no configured owner', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    writeSchema(root, ORDERS_SOURCE);
    const owners = { ...CONFIG.owners };
    delete owners.MasterProduct;
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({
        version: 1,
        ...CONFIG,
        owners,
        allowlist: ['orders.Order -> channels.ChannelAccount'],
      }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /MasterProduct/);
    assert.match(result.stderr, /no owner|missing owner/i);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('refuses a data file whose version it does not know', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-cross-owner-fk-'));

  try {
    writeSchema(root, ORDERS_SOURCE);
    write(
      root,
      'scripts/cross-owner-fk.json',
      JSON.stringify({ version: 2, ...CONFIG }),
    );

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /version must be 1/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('passes on the current schema with the recorded cross-owner allowlist', () => {
  const result = runScanner(repoRoot);

  // Only the cross-owner count is this test's business. Asserting the scope and
  // intra-owner totals too would turn any unrelated model with an organization
  // foreign key into a failure of this guard.
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /63 cross-owner transitional allowlisted/);
});
