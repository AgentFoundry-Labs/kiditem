import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as schemaArtifactSync from '../check-schema-artifact-sync.mjs';
import {
  analyzeSchemaArtifactSync,
  mergeChangedFiles,
} from '../check-schema-artifact-sync.mjs';

test('passes when no Prisma schema files changed', () => {
  const result = analyzeSchemaArtifactSync(['apps/server/src/products/products.module.ts']);

  assert.equal(result.requiresGeneratedArtifacts, false);
  assert.equal(result.hasGeneratedArtifacts, false);
  assert.deepEqual(result.schemaFiles, []);
});

test('requires generated navigation artifacts for Prisma model changes', () => {
  const result = analyzeSchemaArtifactSync(['prisma/models/orders.prisma']);

  assert.equal(result.requiresGeneratedArtifacts, true);
  assert.equal(result.hasGeneratedArtifacts, false);
  assert.deepEqual(result.schemaFiles, ['prisma/models/orders.prisma']);
});

test('requires both the full and a domain ERD for Prisma model changes', () => {
  const onlyOverview = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/ERD.md',
  ]);
  const onlyDomain = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/erd/orders.md',
  ]);
  const complete = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/ERD.md',
    'docs/erd/orders.md',
  ]);

  assert.equal(onlyOverview.hasGeneratedArtifacts, false);
  assert.equal(onlyDomain.hasGeneratedArtifacts, false);
  assert.equal(complete.hasGeneratedArtifacts, true);
  assert.equal(complete.erdOverviewChanged, true);
  assert.deepEqual(complete.domainErdFiles, ['docs/erd/orders.md']);
});

test('does not accept retired Graphify output as ERD evidence', () => {
  const result = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'graphify-out/schema/graph.json',
  ]);

  assert.equal(result.requiresGeneratedArtifacts, true);
  assert.equal(result.hasGeneratedArtifacts, false);
  assert.equal(result.erdOverviewChanged, false);
  assert.deepEqual(result.domainErdFiles, []);
});

test('merges committed, staged, unstaged, and untracked changed files', () => {
  const files = mergeChangedFiles([
    ['prisma/models/orders.prisma'],
    ['docs/ERD.md', 'prisma/models/orders.prisma'],
    ['docs/erd/orders.md'],
  ]);

  assert.deepEqual(files, [
    'prisma/models/orders.prisma',
    'docs/ERD.md',
    'docs/erd/orders.md',
  ]);
});

test('reports stale generated ERD content rather than accepting changed artifact paths alone', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kiditem-schema-artifact-sync-'));

  try {
    await mkdir(path.join(repoRoot, 'prisma', 'models'), { recursive: true });
    await mkdir(path.join(repoRoot, 'docs', 'erd'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'prisma', 'models', 'channels.prisma'),
      `/// @namespace Channels
/// @describe Durable owner receipt.
model ChannelReceipt {
  id String @id

  @@map("channel_receipts")
}
`,
      'utf8',
    );
    await writeFile(path.join(repoRoot, 'docs', 'ERD.md'), 'stale overview\n', 'utf8');
    await writeFile(path.join(repoRoot, 'docs', 'erd', 'channels.md'), 'stale domain\n', 'utf8');

    assert.equal(typeof schemaArtifactSync.checkGeneratedErdArtifacts, 'function');
    const result = await schemaArtifactSync.checkGeneratedErdArtifacts({ repoRoot });

    assert.equal(result.matches, false);
    assert.deepEqual(result.driftedFiles, ['docs/ERD.md', 'docs/erd/channels.md']);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
