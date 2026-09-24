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
    assert.match(model, /detailPages\s+DetailPage\[\]\s+@relation\("DetailPageContentWorkspace"\)/);
    assert.match(model, /thumbnailGenerations\s+ThumbnailGeneration\[\]\s+@relation\("ThumbnailGenerationContentWorkspace"\)/);
    assert.match(model, /assets\s+ContentAsset\[\]\s+@relation\("ContentAssetWorkspace"\)/);
    // 옛 생성 · 아티팩트 표는 상세 페이지 하나로 합쳐졌다(KID-319).
    assert.doesNotMatch(aiSchema, /model (?:ContentGeneration|DetailPageArtifact)\s+\{/);
    assert.doesNotMatch(aiSchema, /model RegistrationWorkspace\s+\{/);
    assert.doesNotMatch(aiSchema, /registrationWorkspaceId\s+String\?\s+@map\("registration_workspace_id"\)/);
  });

  it('defines RegistrationTarget as a reusable Channels selling-product target', () => {
    const channelsSchema = readModelFile('prisma/models/channels.prisma');
    const model = extractModel(channelsSchema, 'RegistrationTarget');

    for (const field of [
      'salesProductId',
      'channelAccountId',
      'archivedAt',
      'registrationInput',
      'selectedThumbnailAssetId',
      'selectedDetailPageRevisionId',
      'createdByUserId',
    ]) {
      assert.match(model, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
    assert.doesNotMatch(
      model,
      /\bmasterId\b|\bcontentWorkspaceId\b|isCurrentForMaster|appliedToMasterAt|submissionKey|providerSubmissionId|lastError|registrationResult|submissionPayloadJson|reviewPayloadHash|approvedAt|approvedByUserId|closedAt|isDeleted/,
    );
    assert.doesNotMatch(model, /^\s*(?:status|channelListingId)\s+/m);
    assert.match(model, /salesProductId\s+String\s+@map/);
    // 원천은 판매상품이 가리킨다(KID-310).
    assert.doesNotMatch(model, /^\s*sourceCandidateId\s+/m);
    assert.match(model, /executions\s+ProductRegistrationExecution\[\]/);
    assert.match(model, /selectedOptions\s+RegistrationTargetOption\[\]/);
    assert.match(model, /channelAccount\s+ChannelAccount\s+@relation/);
    assert.match(model, /salesProduct\s+SalesProduct\s+@relation/);
    // 상품 × 몰 계정당 활성 등록 설정은 하나다(KID-310).
    assert.match(model, /@@unique\(\[organizationId, salesProductId, channelAccountId\]/);
  });

  it('indexes all final RegistrationTarget foreign keys', () => {
    const channelsSchema = readModelFile('prisma/models/channels.prisma');
    const model = extractModel(channelsSchema, 'RegistrationTarget');

    for (const index of [
      '@@index([organizationId, archivedAt])',
      '@@index([salesProductId, organizationId])',
      '@@index([channelAccountId])',
      '@@index([selectedDetailPageRevisionId])',
      '@@index([selectedThumbnailAssetId])',
      '@@index([createdByUserId])',
    ]) {
      assert.ok(model.includes(index), `Expected RegistrationTarget to include ${index}`);
    }
    // 등록 대상은 Content 의 revision · 자산 id 만 고른다 — 생성 job · 아티팩트 id 는 두지 않는다(KID-313 W2).
    assert.doesNotMatch(
      model,
      /selectedDetailPageArtifactId|selectedDetailPageGenerationId|selectedThumbnailGenerationId|selectedThumbnailGenerationCandidateId|selectedThumbnailUrl|displayName/,
    );
  });

  it('makes ChannelListing account-aware for multi-account marketplace listings', () => {
    const channelsSchema = readModelFile('prisma/models/channels.prisma');
    const listing = extractModel(channelsSchema, 'ChannelListing');
    const account = extractModel(channelsSchema, 'ChannelAccount');

    assert.match(listing, /channelAccountId\s+String\s+@map\("channel_account_id"\)\s+@db\.Uuid/);
    assert.match(
      listing,
      /channelAccount\s+ChannelAccount\s+@relation\(fields:\s*\[channelAccountId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\],\s*onDelete:\s*Restrict\)/,
    );
    assert.match(account, /listings\s+ChannelListing\[\]/);
    assert.match(account, /^\s*productPreparations\s+RegistrationTarget\[\]/m);
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
    assert.doesNotMatch(listing, /^\s*registrationTargets\s+RegistrationTarget\[\]/m);
    assert.match(listing, /^\s*rawJson\s+Json\?/m);
  });
});
