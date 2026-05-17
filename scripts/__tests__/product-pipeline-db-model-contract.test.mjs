import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

function readModelFile(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function extractModel(schema, modelName) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Expected model ${modelName} to exist`);
  return match[0];
}

describe('product pipeline DB model contract', () => {
  it('uses ContentWorkspace as the active content/version workspace schema name', () => {
    const aiSchema = readModelFile('prisma/models/ai.prisma');
    const model = extractModel(aiSchema, 'ContentWorkspace');

    assert.match(model, /@@map\("content_workspaces"\)/);
    assert.match(model, /contentGenerations\s+ContentGeneration\[\]\s+@relation\("ContentGenerationContentWorkspace"\)/);
    assert.match(model, /thumbnailGenerations\s+ThumbnailGeneration\[\]\s+@relation\("ThumbnailGenerationContentWorkspace"\)/);
    assert.match(model, /detailPageArtifacts\s+DetailPageArtifact\[\]\s+@relation\("DetailPageArtifactContentWorkspace"\)/);
    assert.doesNotMatch(aiSchema, /model RegistrationWorkspace\s+\{/);
    assert.doesNotMatch(aiSchema, /registrationWorkspaceId\s+String\?\s+@map\("registration_workspace_id"\)/);
  });

  it('defines ProductPreparation as candidate-to-master preparation state without unique master ownership', () => {
    const aiSchema = readModelFile('prisma/models/ai.prisma');
    const model = extractModel(aiSchema, 'ProductPreparation');

    assert.match(model, /sourceCandidateId\s+String\?\s+@map\("source_candidate_id"\)\s+@db\.Uuid/);
    assert.match(model, /masterId\s+String\?\s+@map\("master_id"\)\s+@db\.Uuid/);
    assert.match(model, /contentWorkspaceId\s+String\?\s+@map\("content_workspace_id"\)\s+@db\.Uuid/);
    assert.match(model, /isCurrentForMaster\s+Boolean\s+@default\(false\)\s+@map\("is_current_for_master"\)/);
    assert.match(model, /appliedToMasterAt\s+DateTime\?\s+@map\("applied_to_master_at"\)\s+@db\.Timestamptz/);

    assert.match(
      model,
      /@@unique\(\[organizationId,\s*masterId\][\s\S]*master_id IS NOT NULL AND is_current_for_master = true AND is_deleted = false/,
    );
    assert.doesNotMatch(
      model,
      /@@unique\(\[organizationId,\s*masterId\][\s\S]*master_id IS NOT NULL AND is_deleted = false"\)/,
      'masterId itself must not be unique; many preparations can feed one MasterProduct',
    );
  });

  it('indexes all ProductPreparation foreign keys and common current-master lookups', () => {
    const aiSchema = readModelFile('prisma/models/ai.prisma');
    const model = extractModel(aiSchema, 'ProductPreparation');

    for (const index of [
      '@@index([sourceCandidateId])',
      '@@index([masterId])',
      '@@index([contentWorkspaceId])',
      '@@index([selectedDetailPageArtifactId])',
      '@@index([selectedDetailPageRevisionId])',
      '@@index([selectedDetailPageGenerationId])',
      '@@index([selectedThumbnailGenerationId])',
      '@@index([selectedThumbnailGenerationCandidateId])',
      '@@index([createdByUserId])',
      '@@index([organizationId, masterId, isDeleted])',
      '@@index([organizationId, masterId, isCurrentForMaster, isDeleted])',
    ]) {
      assert.ok(model.includes(index), `Expected ProductPreparation to include ${index}`);
    }
  });

  it('makes ChannelListing account-aware for multi-account marketplace listings', () => {
    const coreSchema = readModelFile('prisma/models/core.prisma');
    const listing = extractModel(coreSchema, 'ChannelListing');
    const account = extractModel(coreSchema, 'ChannelAccount');

    assert.match(listing, /channelAccountId\s+String\?\s+@map\("channel_account_id"\)\s+@db\.Uuid/);
    assert.match(
      listing,
      /channelAccount\s+ChannelAccount\?\s+@relation\(fields:\s*\[channelAccountId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/,
    );
    assert.match(account, /listings\s+ChannelListing\[\]/);

    for (const index of [
      '@@index([channelAccountId])',
      '@@index([organizationId, channelAccountId, isDeleted])',
      '@@index([organizationId, channel, isDeleted])',
      '@@index([organizationId, masterId, isDeleted])',
      '@@index([organizationId, isDeleted, updatedAt, id])',
    ]) {
      assert.ok(listing.includes(index), `Expected ChannelListing to include ${index}`);
    }

    assert.match(
      listing,
      /@@unique\(\[organizationId,\s*channelAccountId,\s*externalId\][\s\S]*is_deleted = false AND channel_account_id IS NOT NULL/,
    );
    assert.doesNotMatch(
      listing,
      /@@unique\(\[organizationId,\s*channel,\s*externalId\]/,
      'ChannelListing externalId uniqueness must be channel-account scoped so one organization can connect multiple accounts on the same channel',
    );
  });
});
