import test from 'node:test';
import assert from 'node:assert/strict';
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

test('accepts ERD or graphify artifacts with schema changes', () => {
  const result = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/erd/orders.md',
    'graphify-out/schema/graph.json',
  ]);

  assert.equal(result.requiresGeneratedArtifacts, true);
  assert.equal(result.hasGeneratedArtifacts, true);
  assert.deepEqual(result.generatedArtifacts, [
    'docs/erd/orders.md',
    'graphify-out/schema/graph.json',
  ]);
});

test('merges committed, staged, unstaged, and untracked changed files', () => {
  const files = mergeChangedFiles([
    ['prisma/models/orders.prisma'],
    ['docs/ERD.md', 'prisma/models/orders.prisma'],
    ['graphify-out/schema/graph.json'],
    ['docs/erd/orders.md'],
  ]);

  assert.deepEqual(files, [
    'prisma/models/orders.prisma',
    'docs/ERD.md',
    'graphify-out/schema/graph.json',
    'docs/erd/orders.md',
  ]);
});
