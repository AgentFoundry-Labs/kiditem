import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

function readModelFile(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function extractEnvKeys(path) {
  return readModelFile(path)
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .filter(Boolean);
}

function redactEnvValues(path) {
  return readModelFile(path)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.replace(/^([A-Za-z_][A-Za-z0-9_]*)=.*/, '$1='))
    .join('\n');
}

function extractModel(schema, modelName) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Expected model ${modelName} to exist`);
  return match[0];
}

describe('product pipeline DB model contract', () => {
  it('runs content workspace rename before schema push in staging deploy', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const preSchema = workflow.indexOf('npm run data:migrate -- up --phase pre-schema');
    const dbPush = workflow.indexOf('npx prisma db push');
    const postSchema = workflow.indexOf('npm run data:migrate -- up --phase post-schema');

    assert.ok(preSchema !== -1, 'expected staging deploy to run pre-schema migrations');
    assert.ok(postSchema !== -1, 'expected staging deploy to run post-schema migrations');
    assert.ok(preSchema < dbPush, 'pre-schema rename must run before Prisma db push');
    assert.ok(dbPush < postSchema, 'post-schema backfills must run after Prisma db push');
  });

  it('preflights ChannelListing duplicate safety before accepting staging data loss', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const preflight = workflow.indexOf('Check staging data-loss preflight');
    const acceptDataLoss = workflow.indexOf('npx prisma db push --accept-data-loss');

    assert.ok(preflight !== -1, 'expected staging deploy to preflight reviewed data-loss gates');
    assert.ok(preflight < acceptDataLoss, 'data-loss preflight must run before --accept-data-loss');
    assert.match(workflow, /channel_listings_org_account_external_id_key/);
    assert.match(workflow, /GROUP BY organization_id,\s*channel_account_id,\s*external_id/);
    assert.match(workflow, /HAVING count\(\*\) > 1/);
  });

  it('verifies the public staging URL after EC2 deploy', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const deployImages = workflow.indexOf('Deploy images on EC2');
    const publicSmoke = workflow.indexOf('Verify public staging URL');

    assert.ok(publicSmoke !== -1, 'expected staging deploy to verify the public URL');
    assert.ok(deployImages < publicSmoke, 'public smoke must run after EC2 image deploy');
    assert.match(workflow, /STAGING_URL:\s*\$\{\{ vars\.STAGING_URL \}\}/);
    assert.match(workflow, /"\$STAGING_URL\/login"/);
    assert.match(workflow, /"\$STAGING_URL\/api\/auth\/me"/);
  });

  it('tags successful staging deploys after public smoke and migration status', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const publicSmoke = workflow.indexOf('Verify public staging URL');
    const migrationStatus = workflow.indexOf('Verify staging data migration status');
    const deployTag = workflow.indexOf('Tag successful staging deploy');

    assert.match(workflow, /deploy:[\s\S]*permissions:[\s\S]*contents: write/);
    assert.ok(deployTag !== -1, 'expected staging deploy to create a Git tag after success');
    assert.ok(publicSmoke < deployTag, 'staging tag must be created after public smoke passes');
    assert.ok(migrationStatus < deployTag, 'staging tag must be created after migration status passes');
    assert.match(workflow, /tag="staging-v\$\{APP_VERSION\}-\$\{deploy_date\}-\$\{short_sha\}"/);
    assert.match(workflow, /git tag -a "\$tag" "\$GIT_SHA"/);
    assert.match(workflow, /git push origin "refs\/tags\/\$tag"/);
  });

  it('renders staging runtime env files from GitHub environment before syncing EC2 assets', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const renderer = readModelFile('deploy/staging/render-runtime-env.sh');
    const renderEnv = workflow.indexOf('Render staging runtime env files');
    const syncAssets = workflow.indexOf('Sync staging compose assets');

    assert.ok(renderEnv !== -1, 'expected staging deploy to render runtime env files from GitHub environment');
    assert.ok(renderEnv < syncAssets, 'runtime env files must be rendered before EC2 asset sync');
    assert.match(workflow, /GEMINI_API_KEY:\s*\$\{\{ secrets\.STAGING_GEMINI_API_KEY \}\}/);
    assert.match(workflow, /CHANNEL_CREDENTIALS_ENCRYPTION_KEY:\s*\$\{\{ secrets\.STAGING_CHANNEL_CREDENTIALS_ENCRYPTION_KEY \}\}/);
    assert.match(workflow, /S3_SECRET_KEY:\s*\$\{\{ secrets\.STAGING_S3_SECRET_KEY \}\}/);
    assert.match(workflow, /AI_TEXT_MODEL:\s*\$\{\{ vars\.STAGING_AI_TEXT_MODEL \}\}/);
    assert.match(workflow, /AI_IMAGE_MODEL:\s*\$\{\{ vars\.STAGING_AI_IMAGE_MODEL \}\}/);
    assert.match(workflow, /AI_IMAGE_ANALYSIS_MODEL:\s*\$\{\{ vars\.STAGING_AI_IMAGE_ANALYSIS_MODEL \}\}/);
    assert.match(workflow, /AGENT_DEFAULT_MODEL:\s*\$\{\{ vars\.STAGING_AGENT_DEFAULT_MODEL \}\}/);
    assert.match(workflow, /tar -czf - .*\.env\.staging\.api .*\.env\.staging\.web/s);
    assert.match(renderer, /required_api_env=\(/);
    assert.match(renderer, /GEMINI_API_KEY/);
    assert.match(renderer, /AI_IMAGE_MODEL/);
    assert.match(renderer, /AI_IMAGE_ANALYSIS_MODEL/);
    assert.doesNotMatch(renderer, /AGENT_DETAIL_PAGE_IMAGE_MODEL/);
    assert.doesNotMatch(renderer, /AGENT_DETAIL_PAGE_VISION_MODEL/);
    assert.doesNotMatch(renderer, /AGENT_THUMBNAIL_GENERATE_MODEL/);
    assert.doesNotMatch(renderer, /AGENT_THUMBNAIL_AUTO_EDIT_MODEL/);
    assert.doesNotMatch(renderer, /AGENT_IMAGE_EDIT_MODEL/);
    assert.doesNotMatch(workflow, /STAGING_AGENT_THUMBNAIL_AUTO_EDIT_MODEL/);
    assert.doesNotMatch(workflow, /STAGING_AGENT_DETAIL_PAGE_IMAGE_MODEL/);
    assert.doesNotMatch(workflow, /STAGING_AGENT_THUMBNAIL_GENERATE_MODEL/);
    assert.doesNotMatch(workflow, /STAGING_AGENT_IMAGE_EDIT_MODEL/);
    assert.match(renderer, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it('keeps the local server API env example aligned with the staging API runtime env', () => {
    const stagingApiKeys = extractEnvKeys('deploy/staging/env/api.env.example');
    const serverExampleKeys = extractEnvKeys('apps/server/.env.example');

    assert.deepEqual(serverExampleKeys, stagingApiKeys);
    assert.equal(
      redactEnvValues('apps/server/.env.example'),
      redactEnvValues('deploy/staging/env/api.env.example'),
    );
  });

  it('keeps the current staging stack up when image pull cleanup still runs out of disk', () => {
    const workflow = readModelFile('.github/workflows/staging-deploy.yml');
    const remoteDeploy = readModelFile('deploy/staging/remote-deploy.sh');

    assert.match(workflow, /allow_downtime_for_space:/);
    assert.match(workflow, /ALLOW_STAGING_DOWNTIME_FOR_SPACE:\s*\$\{\{ inputs\.allow_downtime_for_space && '1' \|\| '0' \}\}/);
    assert.match(workflow, /export ALLOW_STAGING_DOWNTIME_FOR_SPACE=\$\(q "\$ALLOW_STAGING_DOWNTIME_FOR_SPACE"\)/);
    assert.match(remoteDeploy, /ALLOW_STAGING_DOWNTIME_FOR_SPACE/);
    assert.match(remoteDeploy, /Refusing to stop the running staging stack/);
    assert.match(remoteDeploy, /Set ALLOW_STAGING_DOWNTIME_FOR_SPACE=1/);
  });

  it('preserves candidate image refs when normalizing legacy staging deploy env files', () => {
    const remoteDeploy = readModelFile('deploy/staging/remote-deploy.sh');
    const candidateCapture = remoteDeploy.indexOf('local candidate_api="$KIDITEM_API_IMAGE"');
    const deployEnvLoad = remoteDeploy.indexOf('load_deploy_env_if_exists', candidateCapture);
    const targetAssignment = remoteDeploy.indexOf('green_api="$candidate_api"', deployEnvLoad);

    assert.ok(candidateCapture !== -1, 'expected deploy script to capture candidate API image before loading deploy env');
    assert.ok(deployEnvLoad !== -1, 'expected deploy script to load existing deploy env after candidate capture');
    assert.ok(targetAssignment !== -1, 'expected target slot to use the captured candidate image');
    assert.ok(candidateCapture < deployEnvLoad, 'legacy deploy env must not overwrite candidate image input');
    assert.ok(deployEnvLoad < targetAssignment, 'target slot assignment must happen after legacy env normalization');
    assert.match(remoteDeploy, /normalize_slot_deploy_env\(\)/);
    assert.match(remoteDeploy, /KIDITEM_BLUE_API_IMAGE="\$\{KIDITEM_BLUE_API_IMAGE:-\$legacy_api\}"/);
    assert.match(remoteDeploy, /KIDITEM_GREEN_WEB_IMAGE="\$\{KIDITEM_GREEN_WEB_IMAGE:-\$legacy_web\}"/);
  });

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
