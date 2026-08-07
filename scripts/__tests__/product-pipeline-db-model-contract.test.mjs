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

  it('defines ProductPreparation as a channel-scoped registration attempt', () => {
    const aiSchema = readModelFile('prisma/models/ai.prisma');
    const model = extractModel(aiSchema, 'ProductPreparation');

    assert.match(model, /sourceCandidateId\s+String\s+@map\("source_candidate_id"\)\s+@db\.Uuid/);
    assert.match(model, /channelAccountId\s+String\s+@map\("channel_account_id"\)\s+@db\.Uuid/);
    assert.match(model, /sourceContentWorkspaceId\s+String\s+@map\("source_content_workspace_id"\)\s+@db\.Uuid/);
    assert.match(model, /submissionKey\s+String\s+@map\("submission_key"\)/);
    assert.doesNotMatch(model, /\bmasterId\b|\bcontentWorkspaceId\b|isCurrentForMaster|appliedToMasterAt/);
    assert.match(model, /@@unique\(\[organizationId,\s*sourceCandidateId,\s*channelAccountId\]/);
  });

  it('indexes all final ProductPreparation foreign keys', () => {
    const aiSchema = readModelFile('prisma/models/ai.prisma');
    const model = extractModel(aiSchema, 'ProductPreparation');

    for (const index of [
      '@@index([sourceCandidateId])',
      '@@index([channelAccountId])',
      '@@index([sourceContentWorkspaceId])',
      '@@index([channelListingId])',
      '@@index([selectedDetailPageArtifactId])',
      '@@index([selectedDetailPageRevisionId])',
      '@@index([selectedDetailPageGenerationId])',
      '@@index([selectedThumbnailGenerationId])',
      '@@index([selectedThumbnailGenerationCandidateId])',
      '@@index([createdByUserId])',
    ]) {
      assert.ok(model.includes(index), `Expected ProductPreparation to include ${index}`);
    }
  });

  it('makes ChannelListing account-aware for multi-account marketplace listings', () => {
    const coreSchema = readModelFile('prisma/models/core.prisma');
    const listing = extractModel(coreSchema, 'ChannelListing');
    const account = extractModel(coreSchema, 'ChannelAccount');

    assert.match(listing, /channelAccountId\s+String\s+@map\("channel_account_id"\)\s+@db\.Uuid/);
    assert.match(
      listing,
      /channelAccount\s+ChannelAccount\s+@relation\(fields:\s*\[channelAccountId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\],\s*onDelete:\s*Restrict\)/,
    );
    assert.match(account, /listings\s+ChannelListing\[\]/);
    assert.match(account, /@@unique\(\[id,\s*organizationId\]/);

    for (const index of [
      '@@index([channelAccountId])',
      '@@index([organizationId, channelAccountId, isActive])',
      '@@index([organizationId, updatedAt, id])',
    ]) {
      assert.ok(listing.includes(index), `Expected ChannelListing to include ${index}`);
    }

    assert.match(
      listing,
      /@@unique\(\[organizationId,\s*channelAccountId,\s*externalId\]\)/,
    );
    assert.doesNotMatch(
      listing,
      /@@unique\(\[organizationId,\s*channel,\s*externalId\]/,
      'ChannelListing externalId uniqueness must be channel-account scoped so one organization can connect multiple accounts on the same channel',
    );
    assert.doesNotMatch(listing, /^\s*(?:masterId|channel|channelPrice)\s+/m);
    assert.match(listing, /^\s*rawJson\s+Json\?/m);
  });
});
