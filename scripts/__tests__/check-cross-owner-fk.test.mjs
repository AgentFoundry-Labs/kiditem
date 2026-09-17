import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyRelations,
  parseRelationEdges,
} from '../check-cross-owner-fk.mjs';

const scanner = fileURLToPath(
  new URL('../check-cross-owner-fk.mjs', import.meta.url),
);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const CONFIG = {
  owners: {
    ChannelAccount: 'channels',
    MasterProduct: 'products',
    Organization: 'scope',
    OrganizationMembership: 'scope',
    SourceImportRun: 'runs',
    User: 'scope',
  },
  scopeTargets: ['Organization', 'OrganizationMembership', 'User'],
  keptTargets: ['SourceImportRun'],
  allowlist: [],
};

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
    write(root, 'prisma/models/orders.prisma', ORDERS_SOURCE);
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
    write(root, 'prisma/models/orders.prisma', ORDERS_SOURCE);
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

test('passes on the current schema with the recorded cross-owner allowlist', () => {
  const result = runScanner(repoRoot);

  // Only the cross-owner count is this test's business. Asserting the scope and
  // intra-owner totals too would turn any unrelated model with an organization
  // foreign key into a failure of this guard.
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /48 cross-owner allowlisted/);
});
