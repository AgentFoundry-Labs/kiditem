import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as schemaArtifactSync from '../check-schema-artifact-sync.mjs';
import { writeErd } from '../generate-prisma-erd.mjs';
import {
  analyzeSchemaArtifactSync,
  mergeChangedFiles,
} from '../check-schema-artifact-sync.mjs';

test('passes when no Prisma schema files changed', () => {
  const result = analyzeSchemaArtifactSync(['apps/server/src/products/products.module.ts']);

  assert.equal(result.requiresGeneratedArtifacts, false);
  assert.deepEqual(result.schemaFiles, []);
});

test('requires generated navigation artifacts for Prisma model changes', () => {
  const result = analyzeSchemaArtifactSync(['prisma/models/orders.prisma']);

  assert.equal(result.requiresGeneratedArtifacts, true);
  assert.deepEqual(result.schemaFiles, ['prisma/models/orders.prisma']);
});

test('passes a schema-only default and index diff when canonical ERD output is unchanged', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kiditem-schema-artifact-sync-'));

  try {
    const modelsDir = path.join(repoRoot, 'prisma', 'models');
    const modelPath = path.join(modelsDir, 'core.prisma');
    await mkdir(modelsDir, { recursive: true });
    await writeFile(
      modelPath,
      `/// @namespace Core
/// @describe Index-only schema fixture.
model SchemaArtifactSyncFixture {
  id String @id
  status String @default("draft")

  @@index([status])
  @@map("schema_artifact_sync_fixtures")
}
`,
      'utf8',
    );
    await writeErd({
      modelsDir,
      outputPath: path.join(repoRoot, 'docs', 'ERD.md'),
      domainOutputDir: path.join(repoRoot, 'docs', 'erd'),
    });
    await writeFile(
      modelPath,
      `/// @namespace Core
/// @describe Index-only schema fixture.
model SchemaArtifactSyncFixture {
  id String @id
  status String @default("published")

  @@index([status], map: "schema_artifact_sync_fixture_status_idx")
  @@map("schema_artifact_sync_fixtures")
}
`,
      'utf8',
    );

    assert.equal(typeof schemaArtifactSync.checkSchemaArtifactSync, 'function');
    const result = await schemaArtifactSync.checkSchemaArtifactSync({
      repoRoot,
      files: ['prisma/models/core.prisma'],
    });

    assert.equal(result.requiresGeneratedArtifacts, true);
    assert.equal(result.matches, true);
    assert.deepEqual(result.driftedFiles, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
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

test('reports missing and extra generated ERD files after a schema change', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kiditem-schema-artifact-sync-'));

  try {
    const modelsDir = path.join(repoRoot, 'prisma', 'models');
    await mkdir(modelsDir, { recursive: true });
    await writeFile(
      path.join(modelsDir, 'core.prisma'),
      `/// @namespace Core
/// @describe Generated artifact fixture.
model GeneratedArtifactFixture {
  id String @id

  @@map("generated_artifact_fixtures")
}
`,
      'utf8',
    );

    const missing = await schemaArtifactSync.checkSchemaArtifactSync({
      repoRoot,
      files: ['prisma/models/core.prisma'],
    });
    assert.equal(missing.matches, false);
    assert.deepEqual(missing.driftedFiles, ['docs/ERD.md', 'docs/erd/core.md']);

    await writeErd({
      modelsDir,
      outputPath: path.join(repoRoot, 'docs', 'ERD.md'),
      domainOutputDir: path.join(repoRoot, 'docs', 'erd'),
    });
    await writeFile(path.join(repoRoot, 'docs', 'erd', 'retired.md'), 'retired\n', 'utf8');

    const extra = await schemaArtifactSync.checkSchemaArtifactSync({
      repoRoot,
      files: ['prisma/models/core.prisma'],
    });
    assert.equal(extra.matches, false);
    assert.deepEqual(extra.driftedFiles, ['docs/erd/retired.md']);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
